"""
main.py — FastAPI entry point
==============================
- allow_credentials=True required for cross-origin cookies
- RefreshToken imported so the table is auto-created on startup
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine, Base
from db.models import User, Question, RefreshToken   # RefreshToken must be imported here
from api import auth, quiz

app = FastAPI(title="QuizGenius API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dl-project-pdf-to-mcq.vercel.app",
    ],
    allow_credentials=True,   # REQUIRED — without this, cookies are stripped cross-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Creates all tables including the new refresh_tokens table
Base.metadata.create_all(bind=engine)

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(quiz.router, prefix="/quiz", tags=["Quiz"])


@app.get("/")
def root():
    return {"message": "QuizGenius API Running 🚀", "version": "2.0.0"}


@app.head("/")
def head_root():
    return {}
