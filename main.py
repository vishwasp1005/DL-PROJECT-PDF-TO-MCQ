"""
main.py — FastAPI app entry point (v3 — with logging)
"""

import logging
import sys
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db.database import engine, Base
from db.models import User, Question, RefreshToken, QuizSession
from api import auth, quiz

# ─────────────────────────────────────────────────────────────────────────────
# Logging — configure BEFORE anything else so all module loggers inherit it
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,   # override any handlers already attached (e.g. by uvicorn)
)

# Silence noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("groq").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info("QuizGenius API starting up — logging active")

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="QuizGenius API", version="3.0.0")

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

# ─────────────────────────────────────────────────────────────────────────────
# Global exception handler — catches anything that escapes route handlers
# ─────────────────────────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"UNHANDLED EXCEPTION on {request.method} {request.url.path} — "
        f"{type(exc).__name__}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Request logging middleware — logs every request + response status + duration
# ─────────────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.monotonic()
    logger.info(f"→ {request.method} {request.url.path}")
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(f"✗ {request.method} {request.url.path} — {type(exc).__name__}: {exc}", exc_info=True)
        raise
    elapsed = (time.monotonic() - t0) * 1000
    logger.info(f"← {request.method} {request.url.path} → {response.status_code} ({elapsed:.0f}ms)")
    return response


# ─────────────────────────────────────────────────────────────────────────────
# DB + routes
# ─────────────────────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)
logger.info("Database tables verified/created")

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])
logger.info("Routers registered: /auth /quiz")


@app.get("/")
def root():
    return {"message": "QuizGenius API Running 🚀", "version": "3.0.0"}


@app.get("/ping")
def ping():
    return {"status": "ok", "timestamp": time.time()}


@app.head("/")
def head_root():
    return {}
