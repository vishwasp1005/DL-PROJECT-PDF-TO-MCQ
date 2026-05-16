"""
db/database.py — SQLAlchemy Engine + Session (final)

"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./quizgenius.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,   # detect stale connections before use
)


@event.listens_for(engine, "connect")
def _set_wal_mode(dbapi_connection, connection_record):
    """Enable WAL mode + safety settings on every new SQLite connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")    # safe + faster with WAL
    cursor.execute("PRAGMA busy_timeout=30000")    # wait up to 30s on lock
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
