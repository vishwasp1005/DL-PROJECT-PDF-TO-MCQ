"""
db/models.py — SQLAlchemy Models
==================================
Added: RefreshToken model for server-side token tracking + revocation.
Existing models (User, QuizSession, Question) are unchanged.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from db.database import Base


# =============================================================================
# User
# =============================================================================
class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    quiz_sessions  = relationship("QuizSession", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


# =============================================================================
# RefreshToken — server-side refresh token store
# =============================================================================
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, unique=True, index=True, nullable=False)  # SHA-256 of raw token
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    revoked    = Column(Boolean, default=False)

    user = relationship("User", back_populates="refresh_tokens")


# =============================================================================
# QuizSession (unchanged)
# =============================================================================
class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime, default=datetime.utcnow)
    score           = Column(Integer, nullable=True)
    total_questions = Column(Integer, nullable=True)
    percentage      = Column(Float, nullable=True)

    user      = relationship("User", back_populates="quiz_sessions")
    questions = relationship("Question", back_populates="quiz_session")


# =============================================================================
# Question (unchanged)
# =============================================================================
class Question(Base):
    __tablename__ = "questions"

    id              = Column(Integer, primary_key=True, index=True)
    question        = Column(Text)
    options         = Column(Text)
    correct         = Column(String)
    topic           = Column(String)
    difficulty      = Column(String)
    quiz_session_id = Column(Integer, ForeignKey("quiz_sessions.id"))

    quiz_session = relationship("QuizSession", back_populates="questions")
