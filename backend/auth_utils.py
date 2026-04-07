"""
JWT validation utilities for FastAPI.

Two auth paths are supported:
  1. Internal calls from the Next.js server — validated by X-Internal-Secret header.
     These carry the user_id directly in X-Internal-User-ID so no JWT decode is needed.
  2. Direct calls (legacy / local dev) — validated by decoding the NextAuth JWT from
     the session cookie or Authorization: Bearer header.
"""

import os
import json
import base64
import hashlib
import hmac
from typing import Optional
from fastapi import Request, HTTPException, status


# ─── Internal server-to-server auth ──────────────────────────────────────────

def _verify_internal_call(request: Request) -> Optional[str]:
    """
    Validate a request coming from the Next.js backend.
    Returns the user_id if valid, None otherwise.
    """
    internal_user_id = request.headers.get("X-Internal-User-ID", "")
    internal_secret = request.headers.get("X-Internal-Secret", "")
    expected_secret = os.getenv("INTERNAL_API_SECRET", "")

    if not internal_user_id or not internal_secret or not expected_secret:
        return None

    # Timing-safe comparison to prevent timing attacks
    if hmac.compare_digest(internal_secret, expected_secret):
        return internal_user_id

    return None


# ─── NextAuth JWT decode (direct / legacy calls) ─────────────────────────────

def _base64url_decode(data: str) -> bytes:
    data += "=" * (4 - len(data) % 4)
    return base64.urlsafe_b64decode(data)


def decode_nextauth_jwt(token: str) -> Optional[dict]:
    secret = os.getenv("NEXTAUTH_SECRET", "")
    if not secret:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode()
        key = hashlib.sha256(secret.encode()).digest()
        expected_sig = hmac.new(key, signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(signature_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        return json.loads(_base64url_decode(payload_b64))
    except Exception:
        return None


# ─── Main auth function ───────────────────────────────────────────────────────

def get_user_id_from_request(request: Request) -> str:
    """
    Extract and validate the user ID from an incoming request.

    Priority order:
      1. Internal server-to-server call (X-Internal-User-ID + X-Internal-Secret)
      2. NextAuth JWT in cookie (next-auth.session-token)
      3. NextAuth JWT in Authorization: Bearer header
    """
    # 1. Internal call from Next.js server
    user_id = _verify_internal_call(request)
    if user_id:
        return user_id

    # 2. Cookie-based JWT (works when frontend and backend share origin)
    token = (
        request.cookies.get("next-auth.session-token")
        or request.cookies.get("__Secure-next-auth.session-token")
    )

    # 3. Authorization: Bearer header fallback
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    payload = decode_nextauth_jwt(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("id") or payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    return user_id
