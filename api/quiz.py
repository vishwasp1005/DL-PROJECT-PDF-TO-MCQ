
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.generator import generate_quiz_streaming, split_into_chunks
from core.pdf import extract_text_from_pdf, get_pdf_metadata
from db.database import get_db
from db.models import Question, User, QuizSession
from core.security import verify_token

from pydantic import BaseModel
from typing import List, Optional
import json
import asyncio
import logging
import re
import time

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
ANALYZE_MAX_CHARS   = 50_000
GENERATE_TIMEOUT_S  = 480   # 8-min overall safety net (nginx timeout solved by SSE)

# SSE keepalive: send a heartbeat comment if no chunk completes within this many seconds.
# Render's timeout is 30s — sending every 20s gives a comfortable margin.
SSE_HEARTBEAT_S = 20


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
# SSE helpers
# =============================================================================

def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _sse_heartbeat() -> str:
    """SSE comment — keeps connection alive, ignored by the client parser."""
    return ": heartbeat\n\n"


# =============================================================================
# /generate — SSE streaming PDF → MCQ pipeline
# =============================================================================

@router.post("/generate")
async def generate_quiz(
    num_questions: int = 5,
    q_type: str = "MCQ",
    difficulty: str = "Medium",
    topic: Optional[str] = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate MCQs from a PDF file, streaming progress as SSE events.

    Returns a text/event-stream response. Events:
      {event: "start",  total_chunks, num_questions}
      {event: "chunk",  chunk_idx, q_type, count, done, of}   ← 1 per completed chunk
      {event: "done",   quiz_session_id, questions, total}     ← final event
      {event: "error",  message}                               ← on fatal error
    """
    # ── 1. Read & validate ───────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large ({len(file_bytes)//(1024*1024)}MB). Max: 25MB."
        )

    # ── 2. Extract text (blocking → thread pool) ──────────────────────────────
    try:
        text = await asyncio.to_thread(extract_text_from_pdf, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {e}")
    del file_bytes

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found. PDF may be scanned/image-based."
        )

    # ── 3. Cap question count ─────────────────────────────────────────────────
    word_count = len(text.split())
    if word_count < 200:       max_q = 5
    elif word_count < 500:     max_q = 10
    elif word_count < 1000:    max_q = 20
    elif word_count < 2000:    max_q = 40
    else:                      max_q = min(100, word_count // 60)

    capped = min(num_questions, max_q)

    # ── 4. Compute total chunks for progress reporting ────────────────────────
    chunks       = split_into_chunks(text)
    total_chunks = max(len(chunks), 1)

    # ── 5. Build SSE async generator ─────────────────────────────────────────
    async def event_stream():
        """
        This async generator is the body of the StreamingResponse.

        It:
          a) Sends a "start" event immediately (first bytes on the wire — confirms
             the connection is live before any LLM work begins).
          b) Starts generate_quiz_streaming() as a background asyncio.Task.
          c) Reads from progress_queue as each chunk completes. For each chunk,
             sends an SSE "chunk" event (resets Render's 30s idle timer).
          d) Sends a heartbeat SSE comment every SSE_HEARTBEAT_S seconds if no
             chunk has completed (extra safety for very slow chunks).
          e) After all chunks are done, saves to DB and sends "done" event.
          f) On any exception, sends "error" event so the frontend can display it.
        """
        progress_queue: asyncio.Queue = asyncio.Queue()

        # Send start event immediately — this is the first bytes on the wire.
        # From this moment, Render knows the connection is active.
        yield _sse({
            "event":        "start",
            "total_chunks": total_chunks,
            "num_questions": capped,
            "word_count":   word_count,
        })

        gen_task = asyncio.create_task(
            generate_quiz_streaming(text, capped, q_type, difficulty, topic, progress_queue)
        )

        chunks_done = 0
        all_questions: List[dict] = []
        last_event_t = time.monotonic()

        try:
            while not gen_task.done() or not progress_queue.empty():
                try:
                    # Wait up to SSE_HEARTBEAT_S for a chunk to complete
                    item = await asyncio.wait_for(
                        progress_queue.get(),
                        timeout=SSE_HEARTBEAT_S,
                    )

                    # Real chunk completion event
                    chunks_done += 1
                    chunk_qs     = item.get("questions", [])
                    all_questions.extend(chunk_qs)
                    last_event_t = time.monotonic()

                    yield _sse({
                        "event":     "chunk",
                        "chunk_idx": item.get("chunk_idx", chunks_done - 1),
                        "q_type":    item.get("q_type", q_type),
                        "count":     len(chunk_qs),
                        "done":      chunks_done,
                        "of":        total_chunks,
                    })

                except asyncio.TimeoutError:
                    # No chunk in SSE_HEARTBEAT_S — send heartbeat comment
                    # to keep Render's proxy alive. The client ignores comments.
                    elapsed = time.monotonic() - last_event_t
                    logger.debug(f"[SSE] Heartbeat — {elapsed:.0f}s since last chunk event")
                    yield _sse_heartbeat()

            # Generation task is done — check for errors
            try:
                final_questions = gen_task.result()
            except Exception as task_exc:
                logger.error(f"[SSE] Generation task raised: {task_exc}")
                yield _sse({"event": "error", "message": str(task_exc)})
                return

            # Use the generator's deduplicated result (more accurate than
            # the incremental all_questions which can have cross-chunk dupes)
            questions = final_questions if final_questions else all_questions

            if not questions:
                yield _sse({
                    "event":   "error",
                    "message": f"AI returned no questions. Try fewer questions (max for this PDF: {max_q})."
                })
                return

            # ── Save to DB ────────────────────────────────────────────────────
            try:
                quiz_session = QuizSession(user_id=current_user.id)
                db.add(quiz_session)
                db.commit()
                db.refresh(quiz_session)

                saved = []
                for q in questions:
                    dq = Question(
                        question        = q["question"],
                        options         = json.dumps(q["options"]),
                        correct         = q["correct"],
                        topic           = q.get("topic", "General"),
                        difficulty      = q.get("difficulty", difficulty),
                        q_type          = q.get("type", q_type),
                        quiz_session_id = quiz_session.id,
                    )
                    db.add(dq)
                    db.commit()
                    db.refresh(dq)
                    saved.append({
                        "id":         dq.id,
                        "question":   dq.question,
                        "options":    json.loads(dq.options),
                        "correct":    dq.correct,
                        "topic":      dq.topic,
                        "difficulty": dq.difficulty,
                        "type":       dq.q_type or q_type,
                    })

                yield _sse({
                    "event":           "done",
                    "quiz_session_id": quiz_session.id,
                    "total":           len(saved),
                    "max_questions":   max_q,
                    "word_count":      word_count,
                    "questions":       saved,
                })

            except Exception as db_exc:
                logger.error(f"[SSE] DB save failed: {db_exc}")
                yield _sse({"event": "error", "message": "Failed to save questions. Please try again."})

        except Exception as exc:
            logger.error(f"[SSE] Unexpected error in event_stream: {exc}", exc_info=True)
            if not gen_task.done():
                gen_task.cancel()
            yield _sse({"event": "error", "message": "Generation failed unexpectedly. Please try again."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # Disable buffering at every layer so events reach the client immediately
            "Cache-Control":       "no-cache",
            "X-Accel-Buffering":   "no",   # disables nginx buffering on Render
            "Connection":          "keep-alive",
        },
    )


# =============================================================================
# /analyze — fast PDF metadata (unchanged)
# =============================================================================

@router.post("/analyze")
async def analyze_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF too large. Max: 25MB.")

    try:
        text, meta = await asyncio.gather(
            asyncio.to_thread(extract_text_from_pdf, file_bytes, ANALYZE_MAX_CHARS),
            asyncio.to_thread(get_pdf_metadata, file_bytes),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {e}")
    del file_bytes

    word_count = len(text.split())
    char_count = len(text)

    if word_count < 200:    max_q = 5
    elif word_count < 500:  max_q = 10
    elif word_count < 1000: max_q = 20
    elif word_count < 2000: max_q = 40
    else:                   max_q = min(100, word_count // 60)

    words       = text.split()
    avg_len     = sum(len(w) for w in words) / max(len(words), 1)
    complex_pct = len([w for w in words if len(w) > 9]) / max(len(words), 1) * 100
    score       = avg_len * 1.5 + complex_pct * 0.4
    difficulty  = "Easy" if score < 12 else "Hard" if score > 20 else "Medium"

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
        "word_count":          word_count,
        "char_count":          char_count,
        "page_count":          meta.get("page_count", 0),
        "size_mb":             meta.get("size_mb", 0),
        "max_questions":       max_q,
        "detected_difficulty": difficulty,
        "topics":              topics,
        "chunk_count":         chunk_count,
        "estimated_batches":   chunk_count,
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
                "id": q.id, "question": q.question,
                "options": json.loads(q.options), "correct": q.correct,
                "topic": q.topic, "difficulty": q.difficulty,
                "type": q.q_type or "MCQ",
            }
            for q in session.questions
        ]
        result.append({
            "quiz_session_id": session.id,
            "created_at":      session.created_at,
            "total_questions": len(session_questions),
            "questions":       session_questions,
        })
    return {"total_sessions": len(result), "generated_by": current_user.username, "sessions": result}


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
        if is_correct: score += 1
        results.append({
            "question_id": question.id, "question_text": question.question,
            "options": json.loads(question.options), "selected": ans.selected,
            "correct": question.correct, "is_correct": is_correct,
        })

    total      = len(results)
    percentage = (score / total * 100) if total else 0
    session.score = score; session.total_questions = total; session.percentage = percentage
    db.commit()

    return {"quiz_session_id": session.id, "total_questions": total,
            "score": score, "percentage": percentage, "results": results}


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
            {"username": row.username, "percentage": round(row.best_pct, 1), "questions": row.total_questions or 0}
            for row in rows
        ]
    }


# =============================================================================
# /ask-tutor
# =============================================================================

class TutorRequest(BaseModel):
    question: str
    context: str = ""
    history: List[dict] = []


@router.post("/ask-tutor")
async def ask_tutor(req: TutorRequest, current_user: User = Depends(get_current_user)):
    try:
        from groq import Groq
        from core.config import GROQ_API_KEY
        client = Groq(api_key=GROQ_API_KEY)
        system_msg = (
            "You are an expert AI tutor. Help students understand quiz questions and concepts. "
            "Be concise (2-4 sentences), use real examples, encourage step-by-step reasoning."
        )
        if req.context:
            system_msg += f"\n\nStudy context:\n{req.context}"
        messages = [{"role": "system", "content": system_msg}]
        for h in req.history[-6:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": req.question})
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.5,
            max_tokens=512,
        )
        return {"answer": response.choices[0].message.content.strip()}
    except Exception as e:
        logger.error(f"AI Tutor error: {e}")
        raise HTTPException(status_code=500, detail="AI Tutor temporarily unavailable.")
