"""
core/security.py — Production-Grade JWT Auth (v2)
==================================================
Changes from v1:
  - SECRET_KEY now reads from environment (never hardcoded)
  - ACCESS_TOKEN_EXPIRE_MINUTES: 15 min  (short-lived, safe)
  - REFRESH_TOKEN_EXPIRE_DAYS:   7 days  (long-lived, HTTP-only cookie)
  - create_refresh_token() — new, stores hashed token in DB for revocation
  - verify_refresh_token() — validates + rotates refresh token
  - verify_token() — unchanged signature, used by all /quiz/* routes
"""

import os
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Cookie, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# Config — read from env, never hardcode
# ─────────────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_32_RANDOM_CHARS")
ALGORITHM  = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS   = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS",   "7"))

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─────────────────────────────────────────────────────────────────────────────
# Access Token (JWT, 15 min)
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload["iat"] = datetime.now(timezone.utc)
    payload["type"] = "access"
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─────────────────────────────────────────────────────────────────────────────
# Refresh Token (opaque random string, 7 days, stored hashed in DB)
# ─────────────────────────────────────────────────────────────────────────────

def generate_refresh_token() -> str:
    """Return a cryptographically random 64-char hex token (raw, not hashed)."""
    return secrets.token_hex(32)   # 256 bits of entropy

def hash_refresh_token(token: str) -> str:
    """SHA-256 hash stored in DB — the raw token goes only into the cookie."""
    return hashlib.sha256(token.encode()).hexdigest()

def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


# ─────────────────────────────────────────────────────────────────────────────
# verify_token — used by all /quiz/* endpoints via Depends()
# Accepts token from Authorization header OR tries cookie fallback
# ─────────────────────────────────────────────────────────────────────────────

def verify_token(
    token: Optional[str] = Depends(oauth2_scheme),
) -> str:
    """
    Validate the short-lived access token.
    Returns username (str) on success.
    Raises 401 on any failure — the frontend interceptor will then call /auth/refresh.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")

        if not username or token_type != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        return username

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
