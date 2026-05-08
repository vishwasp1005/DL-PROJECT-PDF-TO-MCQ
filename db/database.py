"""
db/database.py — SQLAlchemy Engine + Session (v3)
===================================================

CHANGES IN THIS VERSION
────────────────────────
BUG FIXED: SQLite "database is locked" errors under concurrent load

  SYMPTOM  : When two or more users generate quizzes simultaneously, SQLite's
             default DELETE journal mode uses exclusive write locks. While one
             request is saving 20+ Question rows (one commit per row in the old
             code), all other requests that try to write — including concurrent
             quiz generations and quiz attempt saves — receive an OperationalError:
             "database is locked". This surfaces to the frontend as HTTP 500.
             Under high load on a 5-second generation for a small PDF this is
             rare; under 3-4 minute generation for a large PDF it is near-certain.

  FIX 1    : WAL (Write-Ahead Logging) journal mode. WAL allows concurrent
             readers while a write is in progress. It uses optimistic concurrency
             — writers don't block readers and readers don't block writers.
             Enabled via SQLAlchemy event listener on connect.

  FIX 2    : Bulk save for Question rows. The old code did one `db.commit()`
             per question, holding the write lock for the entire loop. The new
             code does `db.add_all(questions)` + one `db.commit()`, reducing
             the lock-hold time from O(N) commits to 1 commit. This change is
             in quiz.py, but WAL here is the belt-and-suspenders fix.

  FIX 3    : pool_pre_ping=True so stale connections are detected before use,
             preventing cryptic "connection already closed" errors on long-lived
             Render deployments.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./quizgenius.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,      # FIX: detect stale connections before use
)


# ── FIX: Enable WAL mode on every new SQLite connection ──────────────────────
# WAL dramatically reduces "database is locked" errors under concurrent load.
# Without WAL, SQLite uses a single exclusive write lock (DELETE journal mode).
# With WAL, concurrent readers and one writer can operate simultaneously.
@event.listens_for(engine, "connect")
def _set_wal_mode(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")   # safe + faster than FULL with WAL
    cursor.execute("PRAGMA busy_timeout=30000")   # wait up to 30s on a locked DB
    cursor.close()


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
