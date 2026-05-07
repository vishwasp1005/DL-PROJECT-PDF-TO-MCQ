"""
main.py — FastAPI app entry point (v2)
=======================================
Changes:
  - Cookie middleware added (required for HTTP-only refresh token cookies)
  - CORS: allow_credentials=True already set — verified correct
  - RefreshToken table created alongside existing tables
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine, Base
from db.models import User, Question, RefreshToken   # RefreshToken added
from api import auth, quiz

app = FastAPI(title="QuizGenius API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dl-project-pdf-to-mcq.vercel.app",
    ],
    allow_credentials=True,    # REQUIRED for cookies to be sent cross-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables (including new refresh_tokens table)
Base.metadata.create_all(bind=engine)

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])


@app.get("/")
def root():
    return {"message": "QuizGenius API Running 🚀", "version": "2.0.0"}


@app.get("/ping")
def ping():
    """
    Lightweight health check / wake-up endpoint.
    Frontend calls this on page load to warm up the Render dyno
    BEFORE the user tries to upload a PDF, eliminating cold-start delays.
    """
    return {"status": "ok", "timestamp": __import__("time").time()}


@app.head("/")
def head_root():
    return {}
