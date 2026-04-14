"""Profile router — resume upload and parsing."""

import os
import json
import hashlib
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

import pdfplumber
import anthropic

from database import get_db
from auth_utils import get_user_id_from_request
from utils import parse_json_field

router = APIRouter()

STORAGE_BASE = Path(os.path.dirname(__file__)).parent.parent / "storage" / "resumes"
STORAGE_BASE.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

PARSE_SYSTEM_PROMPT = """You are a resume parsing assistant. Extract structured information from the resume text provided and return ONLY a valid JSON object with no preamble or markdown."""

PARSE_USER_PROMPT = """Parse this resume and return a JSON object with exactly these fields:
{{
  "experience_level": "ENTRY | MID | SENIOR | STAFF",
  "years_of_experience": <integer>,
  "skills": ["skill1", "skill2", ...],
  "target_roles": ["role1", "role2", ...],
  "education": [{{"degree": "", "field": "", "institution": "", "year": 0}}]
}}

Rules:
- experience_level: ENTRY = 0-2 years, MID = 3-5, SENIOR = 6-10, STAFF = 10+
- skills: Extract all technical and soft skills mentioned. Maximum 40 skills.
- target_roles: Infer likely target roles from the resume. Maximum 8 roles.
- Return ONLY the JSON object. No markdown, no explanation, no preamble.

Resume text:
{resume_text}"""


def extract_text_from_pdf(file_path: Path) -> str:
    """Extract plain text from a PDF file using pdfplumber."""
    text_parts = []
    with pdfplumber.open(str(file_path)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def parse_resume_with_claude(resume_text: str) -> dict:
    """Send resume text to Claude for structured parsing."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Anthropic API key not configured")

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        system=PARSE_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": PARSE_USER_PROMPT.format(resume_text=resume_text[:15000]),
            }
        ],
    )

    raw_text = message.content[0].text.strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        raw_text = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Claude returned invalid JSON: {str(e)}"
        )


def upsert_candidate_profile(
    db: Session,
    user_id: str,
    parsed: dict,
    raw_text: str,
    file_path: str,
) -> None:
    """Upsert the candidate_profiles table with parsed resume data."""
    experience_level = parsed.get("experience_level", "ENTRY")
    valid_levels = {"ENTRY", "MID", "SENIOR", "STAFF"}
    if experience_level not in valid_levels:
        experience_level = "ENTRY"

    # Check if profile exists
    existing = db.execute(
        text("SELECT id FROM candidate_profiles WHERE user_id = :uid"),
        {"uid": user_id}
    ).fetchone()

    skills = parsed.get("skills", [])[:40]
    target_roles = parsed.get("target_roles", [])[:8]
    education = json.dumps(parsed.get("education", []))

    if existing:
        db.execute(
            text("""
                UPDATE candidate_profiles SET
                    raw_resume_text = :raw_text,
                    resume_file_path = :file_path,
                    experience_level = :exp_level,
                    years_of_experience = :years,
                    skills = :skills,
                    target_roles = :target_roles,
                    education = :education,
                    parsed_at = NOW(),
                    updated_at = NOW()
                WHERE user_id = :user_id
            """),
            {
                "raw_text": raw_text,
                "file_path": file_path,
                "exp_level": experience_level,
                "years": parsed.get("years_of_experience", 0),
                "skills": skills,
                "target_roles": target_roles,
                "education": education,
                "user_id": user_id,
            }
        )
    else:
        db.execute(
            text("""
                INSERT INTO candidate_profiles (
                    id, user_id, raw_resume_text, resume_file_path,
                    experience_level, years_of_experience, skills, target_roles,
                    education, high_value_skills, high_value_titles, preferred_locations,
                    parsed_at, updated_at
                ) VALUES (
                    gen_random_uuid(), :user_id, :raw_text, :file_path,
                    :exp_level, :years, :skills, :target_roles,
                    :education, '{}', '{}', '{}',
                    NOW(), NOW()
                )
            """),
            {
                "user_id": user_id,
                "raw_text": raw_text,
                "file_path": file_path,
                "exp_level": experience_level,
                "years": parsed.get("years_of_experience", 0),
                "skills": skills,
                "target_roles": target_roles,
                "education": education,
            }
        )

    db.commit()


@router.post("/upload-resume")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Accept PDF resume, extract text, parse with Claude, and upsert candidate profile.
    """
    user_id = get_user_id_from_request(request)

    # Validate file type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds maximum size of 10MB"
        )

    # Store file
    user_dir = STORAGE_BASE / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / "resume.pdf"

    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text
    try:
        resume_text = extract_text_from_pdf(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to extract text from PDF: {str(e)}"
        )

    if not resume_text.strip():
        raise HTTPException(
            status_code=422,
            detail="PDF appears to be empty or contains no extractable text"
        )

    # Parse with Claude
    try:
        parsed = parse_resume_with_claude(resume_text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI parsing failed: {str(e)}"
        )

    # Upsert into database
    try:
        upsert_candidate_profile(
            db=db,
            user_id=user_id,
            parsed=parsed,
            raw_text=resume_text,
            file_path=str(file_path),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database update failed: {str(e)}"
        )

    return JSONResponse(
        content={
            "ok": True,
            "parsed": {
                "experience_level": parsed.get("experience_level"),
                "years_of_experience": parsed.get("years_of_experience"),
                "skills_count": len(parsed.get("skills", [])),
                "target_roles": parsed.get("target_roles", []),
            }
        }
    )


@router.get("/me")
async def get_profile(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the current user's candidate profile."""
    user_id = get_user_id_from_request(request)

    row = db.execute(
        text("SELECT * FROM candidate_profiles WHERE user_id = :uid"),
        {"uid": user_id}
    ).fetchone()

    if not row:
        return JSONResponse(content={"profile": None})

    profile = dict(row._mapping)
    # Parse JSON fields
    parse_json_field(profile, "education", [])

    return JSONResponse(content={"profile": profile})
