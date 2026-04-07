"""JWT validation utilities for FastAPI — validates NextAuth.js JWT tokens."""

import os
import json
import base64
import hashlib
import hmac
from typing import Optional
from fastapi import Request, HTTPException, status


def _base64url_decode(data: str) -> bytes:
    """Decode base64url without padding."""
    data += "=" * (4 - len(data) % 4)
    return base64.urlsafe_b64decode(data)


def decode_nextauth_jwt(token: str) -> Optional[dict]:
    """
    Decode a NextAuth JWT token.
    NextAuth uses a simple HMAC-SHA256 JWT by default.
    """
    secret = os.getenv("NEXTAUTH_SECRET", "")
    if not secret:
        return None

    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, signature_b64 = parts

        # Verify signature
        signing_input = f"{header_b64}.{payload_b64}".encode()

        # NextAuth derives the key from the secret using SHA-256
        key = hashlib.sha256(secret.encode()).digest()
        expected_sig = hmac.new(key, signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(signature_b64)

        # Timing-safe comparison
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_base64url_decode(payload_b64))
        return payload
    except Exception:
        return None


def get_user_id_from_request(request: Request) -> str:
    """Extract user ID from the NextAuth session token cookie."""
    # Try session token from cookies
    token = (
        request.cookies.get("next-auth.session-token")
        or request.cookies.get("__Secure-next-auth.session-token")
    )

    if not token:
        # Try Authorization header as fallback
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
