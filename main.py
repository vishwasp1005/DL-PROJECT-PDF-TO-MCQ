"""
main.py — FastAPI app entry point (v4 — auto-migration)
"""

import logging
import sys
import sqlite3
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db.database import engine, Base
from db.models import User, Question, RefreshToken, QuizSession
from api import auth, quiz

# ─────────────────────────────────────────────────────────────────────────────
# Logging — configure BEFORE anything else
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("groq").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Auto-migration
# ─────────────────────────────────────────────────────────────────────────────

# Each entry: (table, column_name, column_definition, backfill_sql_or_None)
# Add new columns here whenever a model field is added.
COLUMN_MIGRATIONS = [
    (
        "questions",
        "q_type",
        "TEXT DEFAULT 'MCQ'",
        "UPDATE questions SET q_type = 'MCQ' WHERE q_type IS NULL",
    ),
]

DB_PATH = "quizgenius.db"


def _auto_migrate():
    """
    Run at startup. Adds any missing columns to the live SQLite database.

    SQLAlchemy's Base.metadata.create_all() creates MISSING tables but never
    alters EXISTING tables. So when a new column is added to a model, it
    exists in Python but not in the DB until this function runs ALTER TABLE.

    Safe to run repeatedly — checks column existence before altering.
    """
    logger.info("[Migration] Checking schema...")

    # Create any entirely missing tables first
    Base.metadata.create_all(bind=engine)
    logger.info("[Migration] Tables verified/created")

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()

            # WAL mode for concurrent access
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")

            for table, column, definition, backfill in COLUMN_MIGRATIONS:
                cursor.execute(f"PRAGMA table_info({table})")
                existing = {row[1] for row in cursor.fetchall()}

                if column not in existing:
                    sql = f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
                    logger.info(f"[Migration] Running: {sql}")
                    cursor.execute(sql)
                    conn.commit()

                    if backfill:
                        cursor.execute(backfill)
                        conn.commit()
                        logger.info(f"[Migration] Back-filled {cursor.rowcount} rows in {table}.{column}")

                    logger.info(f"[Migration] ✅ Added {table}.{column}")
                else:
                    logger.info(f"[Migration] ✓ {table}.{column} already exists")

        logger.info("[Migration] Schema up to date")

    except Exception as e:
        # Log but do NOT crash startup — let the app start and surface
        # the error naturally on first request rather than refusing to boot.
        logger.error(f"[Migration] Failed — {type(e).__name__}: {e}", exc_info=True)


# Run migration before first request
_auto_migrate()

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="QuizGenius API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dl-project-pdf-to-mcq.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"UNHANDLED EXCEPTION {request.method} {request.url.path} — "
        f"{type(exc).__name__}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.monotonic()
    logger.info(f"→ {request.method} {request.url.path}")
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(f"✗ {request.method} {request.url.path} — {type(exc).__name__}: {exc}", exc_info=True)
        raise
    logger.info(f"← {request.method} {request.url.path} {response.status_code} ({(time.monotonic()-t0)*1000:.0f}ms)")
    return response


app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])
logger.info("QuizGenius API ready")


@app.get("/")
def root():
    return {"message": "QuizGenius API Running 🚀", "version": "4.0.0"}


@app.get("/ping")
def ping():
    return {"status": "ok", "timestamp": time.time()}


@app.head("/")
def head_root():
    return {}
