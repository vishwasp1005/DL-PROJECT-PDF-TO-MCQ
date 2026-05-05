"""
migrate_db.py — Add refresh_tokens table (v2 migration)
========================================================
Run once after deploying v2:
    python migrate_db.py

Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS via SQLAlchemy).
"""

from db.database import engine, Base
from db.models import User, QuizSession, Question, RefreshToken   # noqa: F401

print("Running database migration...")
Base.metadata.create_all(bind=engine)
print("✅ Database tables created/updated successfully.")
print("   Tables: users, quiz_sessions, questions, refresh_tokens")
