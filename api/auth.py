"""
api/auth.py — Authentication Router (Production Grade)
=======================================================
Endpoints:
  POST /auth/register  — create account
  POST /auth/login     — returns access token (JSON) + sets refresh cookie
  POST /auth/refresh   — silently issues new access token via refresh cookie
  POST /auth/logout    — revokes refresh token + clears cookie
  GET  /auth/me        — returns current user (validates access token)

Token strategy:
  - Access token  : 15-min JWT in JSON response → stored in localStorage
  - Refresh token : 7-day opaque token in HTTP-only cookie (JS-inaccessible)
  - Refresh tokens hashed in DB → stolen cookies can be detected + revoked
"""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db.database import get_db
from db import models
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
    verify_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

router = APIRouter()

# ── Cookie config ─────────────────────────────────────────────────────────────
IS_PRODUCTION  = os.getenv("ENVIRONMENT", "production").lower() == "production"
COOKIE_NAME    = "qf_refresh_token"
COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600   # seconds


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attach refresh token as HTTP-only cookie — JS cannot read this."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=raw_token,
        httponly=True,              # JS cannot access
        secure=IS_PRODUCTION,       # HTTPS only in production
        samesite="lax",             # CSRF protection
        max_age=COOKIE_MAX_AGE,
        path="/auth",               # only sent to /auth/* routes
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/auth")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str


# =============================================================================
# REGISTER
# =============================================================================

@router.post("/register", status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if len(request.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(models.User).filter(models.User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = models.User(
        username=request.username.strip(),
        hashed_password=hash_password(request.password),
    )
    db.add(user)
    db.commit()
    return {"message": "Account created successfully"}


# =============================================================================
# LOGIN — access token in JSON + refresh token in HTTP-only cookie
# =============================================================================

@router.post("/login")
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Issue 15-min access token
    access_token = create_access_token({"sub": user.username})

    # Issue 7-day refresh token (raw in cookie, hashed in DB)
    raw_refresh = generate_refresh_token()
    token_hash  = hash_refresh_token(raw_refresh)
    expires_at  = refresh_token_expiry()

    # Housekeeping: remove expired tokens for this user
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user.id,
        models.RefreshToken.expires_at < datetime.now(timezone.utc),
    ).delete()

    db.add(models.RefreshToken(
        user_id    = user.id,
        token_hash = token_hash,
        expires_at = expires_at,
    ))
    db.commit()

    _set_refresh_cookie(response, raw_refresh)

    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "username":     user.username,
        "expires_in":   900,   # 15 min in seconds — frontend uses for proactive refresh
    }


# =============================================================================
# REFRESH — silent access token renewal via refresh cookie
# =============================================================================

@router.post("/refresh")
def refresh_token(
    response: Response,
    db: Session = Depends(get_db),
    qf_refresh_token: Optional[str] = Cookie(default=None),
):
    """
    Called automatically by frontend Axios interceptor on 401.
    Browser sends the HTTP-only cookie automatically.
    Rotates refresh token on every call (prevents replay attacks).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expired. Please log in again.",
    )

    if not qf_refresh_token:
        raise credentials_exception

    token_hash = hash_refresh_token(qf_refresh_token)
    db_token   = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == token_hash,
        models.RefreshToken.revoked    == False,
    ).first()

    if not db_token:
        raise credentials_exception

    # Timezone-safe expiry check
    expires_at = db_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        db_token.revoked = True
        db.commit()
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == db_token.user_id).first()
    if not user:
        raise credentials_exception

    # Rotate: revoke old token, issue new one
    db_token.revoked = True
    raw_refresh      = generate_refresh_token()
    new_expires      = refresh_token_expiry()

    db.add(models.RefreshToken(
        user_id    = user.id,
        token_hash = hash_refresh_token(raw_refresh),
        expires_at = new_expires,
    ))
    db.commit()

    access_token = create_access_token({"sub": user.username})
    _set_refresh_cookie(response, raw_refresh)

    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "username":     user.username,
        "expires_in":   900,
    }


# =============================================================================
# LOGOUT — revoke refresh token + clear cookie
# =============================================================================

@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    qf_refresh_token: Optional[str] = Cookie(default=None),
):
    if qf_refresh_token:
        token_hash = hash_refresh_token(qf_refresh_token)
        db.query(models.RefreshToken).filter(
            models.RefreshToken.token_hash == token_hash
        ).update({"revoked": True})
        db.commit()

    _clear_refresh_cookie(response)
    return {"message": "Logged out successfully"}


# =============================================================================
# ME — validate access token + return user info
# =============================================================================

@router.get("/me")
def get_me(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"username": user.username, "id": user.id}
