from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from db.database import Base


# =========================
# User Model
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    quiz_sessions = relationship("QuizSession", back_populates="user")


# =========================
# Quiz Session Model
# =========================
class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    score = Column(Integer, nullable=True)
    total_questions = Column(Integer, nullable=True)
    percentage = Column(Float, nullable=True)

    user = relationship("User", back_populates="quiz_sessions")
    questions = relationship("Question", back_populates="quiz_session")


# =========================
# Question Model
# =========================
class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text)
    options = Column(Text)
    correct = Column(String)
    topic = Column(String)
    difficulty = Column(String)

    quiz_session_id = Column(Integer, ForeignKey("quiz_sessions.id"))

    quiz_session = relationship("QuizSession", back_populates="questions")