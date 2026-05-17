"""
migrate_db.py — Database migration script (final)
"""

import sqlite3
from db.database import engine, Base
from db.models import User, QuizSession, Question, RefreshToken   # noqa: F401

print("Running QuizGenius database migration (final)...")

# ── Step 1: Create/update tables via SQLAlchemy ───────────────────────────────
Base.metadata.create_all(bind=engine)
print("  ✅ Tables verified/created: users, quiz_sessions, questions, refresh_tokens")

# ── Step 2: Raw SQLite alterations (SQLAlchemy create_all doesn't alter existing tables)
DB_PATH = "quizgenius.db"

with sqlite3.connect(DB_PATH) as conn:
    cursor = conn.cursor()

    # Enable WAL mode
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    print("  ✅ WAL journal mode enabled")

    # Add q_type to questions if missing
    cursor.execute("PRAGMA table_info(questions)")
    existing_cols = {row[1] for row in cursor.fetchall()}

    if "q_type" not in existing_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN q_type TEXT DEFAULT 'MCQ'")
        conn.commit()
        cursor.execute("UPDATE questions SET q_type = 'MCQ' WHERE q_type IS NULL")
        conn.commit()
        updated = cursor.rowcount
        print(f"  ✅ Added q_type column to questions ({updated} existing rows back-filled)")
    else:
        print("  ✅ q_type column already exists — no migration needed")

print("\n✅ Migration complete.")
print("   WAL mode: enabled")
print("   Columns: questions.q_type (MCQ/TF/FIB)")
print("   Tables: users, quiz_sessions, questions, refresh_tokens")
