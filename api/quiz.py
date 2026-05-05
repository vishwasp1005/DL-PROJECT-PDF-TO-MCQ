"""
api/quiz.py — Quiz API Router (v2 — large-PDF safe)
====================================================
Key changes from v1:
  - PDF text is extracted via core/pdf.py's page-by-page streaming extractor
    (never loads the full file text into a single string until chunker takes over)
  - /analyze endpoint caps extraction at 50K chars to avoid blocking on huge PDFs
  - /generate endpoint streams pages before chunking — no OOM on 20MB files
  - File size validation rejects files > 20MB at the HTTP boundary (before parsing)
  - Timeout guardrails via asyncio.wait_for on the full generation pipeline
  - All other endpoints (history, attempt, leaderboard, ask-tutor) are unchanged
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.generator import generate_quiz_from_text, split_into_chunks
from core.pdf import extract_text_from_pdf, get_pdf_metadata
from db.database import get_db
from db.models import Question, User, QuizSession
from core.security import verify_token

from pydantic import BaseModel
from typing import List
import json
import asyncio
import logging
import re

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES  = 20 * 1024 * 1024   # 20 MB hard limit
ANALYZE_MAX_CHARS    = 50_000             # cap for /analyze (fast path)
GENERATE_TIMEOUT_S   = 300               # 5-minute timeout for /generate


# =============================================================================
# Auth helper
# =============================================================================

def get_current_user(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# =============================================================================
# /generate — PDF → MCQ pipeline
# =============================================================================

@router.post("/generate")
async def generate_quiz(
    num_questions: int = 5,
    q_type: str = "MCQ",
    difficulty: str = "Medium",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # ── 1. Read & validate file ───────────────────────────────────────────────
    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large ({len(file_bytes) // (1024*1024)}MB). Maximum allowed: 20MB."
        )

    # ── 2. Stream-extract text (page by page, never full string in memory) ────
    try:
        text = extract_text_from_pdf(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {e}")

    # Release raw bytes — no longer needed
    del file_bytes

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in PDF. It may be scanned/image-based.")

    # ── 3. Cap num_questions to text density ──────────────────────────────────
    word_count = len(text.split())
    if word_count < 200:
        max_q = 5
    elif word_count < 500:
        max_q = 10
    elif word_count < 1000:
        max_q = 20
    elif word_count < 2000:
        max_q = 40
    else:
        max_q = min(100, word_count // 60)

    capped_questions = min(num_questions, max_q)
    if capped_questions != num_questions:
        logger.info(f"Capped num_questions {num_questions} → {capped_questions} (words={word_count})")

    # ── 4. Chunked parallel generation (with overall timeout) ─────────────────
    try:
        questions = await asyncio.wait_for(
            generate_quiz_from_text(text, capped_questions, q_type, difficulty),
            timeout=GENERATE_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"MCQ generation timed out after {GENERATE_TIMEOUT_S}s. Try fewer questions or a smaller PDF."
        )
    except RuntimeError as llm_err:
        raise HTTPException(status_code=500, detail=str(llm_err))

    if not questions:
        raise HTTPException(
            status_code=500,
            detail=(
                f"AI returned no questions. PDF may have too little unique content. "
                f"Max supported for this file: {max_q} questions."
            )
        )

    # ── 5. Persist to DB ──────────────────────────────────────────────────────
    quiz_session = QuizSession(user_id=current_user.id)
    db.add(quiz_session)
    db.commit()
    db.refresh(quiz_session)

    saved_questions = []
    for q in questions:
        db_question = Question(
            question=q["question"],
            options=json.dumps(q["options"]),
            correct=q["correct"],
            topic=q.get("topic", "General"),
            difficulty=q.get("difficulty", difficulty),
            quiz_session_id=quiz_session.id
        )
        db.add(db_question)
        db.commit()
        db.refresh(db_question)

        saved_questions.append({
            "id": db_question.id,
            "question": db_question.question,
            "options": json.loads(db_question.options),
            "topic": db_question.topic,
            "difficulty": db_question.difficulty,
        })

    return {
        "chunk_count": len(split_into_chunks(text)),
        "quiz_session_id": quiz_session.id,
        "generated_by": current_user.username,
        "max_questions": max_q,
        "word_count": word_count,
        "questions": [
            {**q, "correct": questions[i]["correct"], "type": questions[i].get("type", q_type)}
            for i, q in enumerate(saved_questions)
        ]
    }


# =============================================================================
# /analyze — fast PDF metadata (no full LLM call)
# =============================================================================

@router.post("/analyze")
async def analyze_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large ({len(file_bytes) // (1024*1024)}MB). Maximum allowed: 20MB."
        )

    # Extract only first ANALYZE_MAX_CHARS to keep /analyze fast on huge PDFs
    try:
        text = extract_text_from_pdf(file_bytes, max_chars=ANALYZE_MAX_CHARS)
        meta = get_pdf_metadata(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {e}")

    del file_bytes

    word_count = len(text.split())
    char_count = len(text)

    if word_count < 200:
        max_q = 5
    elif word_count < 500:
        max_q = 10
    elif word_count < 1000:
        max_q = 20
    elif word_count < 2000:
        max_q = 40
    else:
        max_q = min(100, word_count // 60)

    # Difficulty heuristic
    words = text.split()
    avg_len     = sum(len(w) for w in words) / max(len(words), 1)
    complex_pct = len([w for w in words if len(w) > 9]) / max(len(words), 1) * 100
    score       = avg_len * 1.5 + complex_pct * 0.4
    difficulty  = "Easy" if score < 12 else "Hard" if score > 20 else "Medium"

    # Heading extraction
    lines           = text.split("\n")
    heading_pattern = re.compile(r'^[A-Z][A-Za-z &\-:,]{3,60}$')
    topics          = []
    for line in lines:
        line = line.strip()
        if heading_pattern.match(line) and len(line.split()) <= 8:
            topics.append(line)
        if len(topics) >= 8:
            break

    chunk_count = len(split_into_chunks(text))

    return {
        "word_count": word_count,
        "char_count": char_count,
        "page_count": meta.get("page_count", 0),
        "size_mb": meta.get("size_mb", 0),
        "max_questions": max_q,
        "detected_difficulty": difficulty,
        "topics": topics,
        "chunk_count": chunk_count,
        "estimated_batches": chunk_count,
    }


# =============================================================================
# /history
# =============================================================================

@router.get("/history")
def get_quiz_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sessions = (
        db.query(QuizSession)
        .filter(QuizSession.user_id == current_user.id)
        .order_by(QuizSession.id.desc())
        .all()
    )

    result = []
    for session in sessions:
        session_questions = [
            {
                "id": q.id,
                "question": q.question,
                "options": json.loads(q.options),
                "correct": q.correct,
                "topic": q.topic,
                "difficulty": q.difficulty
            }
            for q in session.questions
        ]
        result.append({
            "quiz_session_id": session.id,
            "created_at": session.created_at,
            "total_questions": len(session_questions),
            "questions": session_questions
        })

    return {
        "total_sessions": len(result),
        "generated_by": current_user.username,
        "sessions": result
    }


# =============================================================================
# /attempt
# =============================================================================

class AnswerItem(BaseModel):
    question_id: int
    selected: str


class AttemptRequest(BaseModel):
    quiz_session_id: int
    answers: List[AnswerItem]


@router.post("/attempt")
def attempt_quiz(
    request: AttemptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(QuizSession).filter(
        QuizSession.id == request.quiz_session_id,
        QuizSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Quiz session not found")

    score, results = 0, []
    for ans in request.answers:
        question = db.query(Question).filter(
            Question.id == ans.question_id,
            Question.quiz_session_id == session.id
        ).first()

        if not question:
            continue

        is_correct = ans.selected == question.correct
        if is_correct:
            score += 1

        results.append({
            "question_id": question.id,
            "question_text": question.question,
            "options": json.loads(question.options),
            "selected": ans.selected,
            "correct": question.correct,
            "is_correct": is_correct
        })

    total      = len(results)
    percentage = (score / total * 100) if total else 0

    session.score           = score
    session.total_questions = total
    session.percentage      = percentage
    db.commit()

    return {
        "quiz_session_id": session.id,
        "total_questions": total,
        "score": score,
        "percentage": percentage,
        "results": results
    }


# =============================================================================
# /leaderboard
# =============================================================================

@router.get("/leaderboard")
def get_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import func

    subq = (
        db.query(
            QuizSession.user_id,
            func.max(QuizSession.percentage).label("best_pct"),
            func.sum(QuizSession.score).label("total_score"),
            func.sum(QuizSession.total_questions).label("total_questions")
        )
        .filter(QuizSession.percentage.isnot(None))
        .group_by(QuizSession.user_id)
        .subquery()
    )

    rows = (
        db.query(User.username, subq.c.best_pct, subq.c.total_score, subq.c.total_questions)
        .join(subq, User.id == subq.c.user_id)
        .order_by(subq.c.best_pct.desc())
        .limit(10)
        .all()
    )

    return {
        "leaderboard": [
            {
                "username": row.username,
                "percentage": round(row.best_pct, 1),
                "questions": row.total_questions or 0,
            }
            for row in rows
        ]
    }


# =============================================================================
# /ask-tutor — AI Tutor (unchanged from v1)
# =============================================================================

class TutorRequest(BaseModel):
    question: str
    context: str = ""
    history: List[dict] = []


@router.post("/ask-tutor")
async def ask_tutor(
    req: TutorRequest,
    current_user: User = Depends(get_current_user)
):
    """AI Tutor endpoint — uses Groq to answer student questions with quiz context."""
    try:
        from groq import Groq
        from core.config import GROQ_API_KEY
        import asyncio

        client = Groq(api_key=GROQ_API_KEY)

        system_msg = (
            "You are an expert AI tutor for QuizForge AI, an adaptive learning platform. "
            "Your role is to help students deeply understand quiz questions and their underlying concepts.\n\n"
            "Guidelines:\n"
            "- Give clear, concise explanations (2-4 sentences unless the topic needs more)\n"
            "- Use simple real-world examples when helpful\n"
            "- Break complex ideas into numbered steps when explaining processes\n"
            "- Be encouraging and positive\n"
            "- If the student asks about the correct answer, explain WHY it's correct, not just what it is\n"
            "- Stay focused on the study topic"
        )
        if req.context:
            system_msg += f"\n\nStudy context:\n{req.context}"

        messages = [{"role": "system", "content": system_msg}]
        for h in req.history[-6:]:
            role    = h.get("role", "user")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": req.question})

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.5,
            max_tokens=512,
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer}

    except Exception as e:
        logger.error(f"AI Tutor error: {e}")
        raise HTTPException(status_code=500, detail="AI Tutor temporarily unavailable.")
