"""
api/quiz.py — Quiz API Router (v5 — save-stable)

"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.generator import generate_quiz_streaming, split_into_chunks
from core.pdf import extract_text_from_pdf, get_pdf_metadata
from db.database import SessionLocal   # FIX BUG 1: import SessionLocal directly
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

MAX_FILE_SIZE_BYTES  = 25 * 1024 * 1024
ANALYZE_MAX_CHARS    = 50_000
SSE_HEARTBEAT_S      = 20
MAX_OPTION_LEN       = 200      # truncate absurdly long options before save
MAX_QUESTION_LEN     = 1000     # truncate absurdly long question text


# =============================================================================
# Auth helper — db NOT injected here (avoids Depends lifecycle issue)
# =============================================================================

def get_current_user(
    username: str = Depends(verify_token),
):
    """
    Returns just the username string. The actual db lookup happens inside
    _get_user_from_db() which uses a fresh session. This decouples user
    auth from the db session lifecycle entirely.
    """
    return username


def _get_user_from_db(username: str) -> Optional[User]:
    """Open a fresh session, fetch the user, close immediately."""
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == username).first()
    finally:
        db.close()


# =============================================================================
# SSE helpers
# =============================================================================

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_heartbeat() -> str:
    return ": heartbeat\n\n"


# =============================================================================
# Question validation + normalisation
# =============================================================================

_LABELS = ["A", "B", "C", "D", "E", "F"]


def _normalize_correct(val) -> str:
    s = str(val).strip()
    if not s:
        return "A"
    first = s[0].upper()
    if first in _LABELS:
        return first
    if s[0].isdigit():
        idx = int(s[0]) - 1
        return _LABELS[idx] if 0 <= idx < len(_LABELS) else "A"
    return "A"


def _validate_question(q: dict, q_type_fallback: str, difficulty_fallback: str) -> Optional[dict]:
    """
    Validate and normalise a single question dict from the LLM.
    Returns a clean dict ready for DB insert, or None if invalid.

    Checks:
      - question text exists and is non-empty
      - options is a list with at least 2 items
      - correct field is present and normalises to A-F
      - all values are JSON-serialisable strings
      - truncates fields exceeding column limits
    """
    try:
        question_text = str(q.get("question", "")).strip()
        if not question_text or len(question_text) < 5:
            return None

        options = q.get("options")
        if not isinstance(options, list) or len(options) < 2:
            return None

        # Ensure all options are non-empty strings, truncate if needed
        clean_options = []
        for opt in options[:6]:   # max 6 options
            opt_str = str(opt).strip()
            if not opt_str:
                return None
            if len(opt_str) > MAX_OPTION_LEN:
                opt_str = opt_str[:MAX_OPTION_LEN - 3] + "..."
            clean_options.append(opt_str)

        correct_raw = q.get("correct", "A")
        correct     = _normalize_correct(correct_raw)

        # Verify correct maps to an existing option
        # correct is "A"/"B"/etc — option[0] should start with "A)"
        correct_idx = _LABELS.index(correct) if correct in _LABELS else 0
        if correct_idx >= len(clean_options):
            correct = _LABELS[0]   # fallback to A if out of range

        topic      = str(q.get("topic", "General")).strip()[:100] or "General"
        difficulty = str(q.get("difficulty", difficulty_fallback)).strip()[:20] or difficulty_fallback
        q_type     = str(q.get("type", q_type_fallback)).strip().upper()[:10] or q_type_fallback

        if q_type not in ("MCQ", "TF", "FIB"):
            q_type = q_type_fallback

        if len(question_text) > MAX_QUESTION_LEN:
            question_text = question_text[:MAX_QUESTION_LEN - 3] + "..."

        # Final JSON serialisability check
        options_json = json.dumps(clean_options, ensure_ascii=False)

        return {
            "question":   question_text,
            "options":    clean_options,
            "options_json": options_json,
            "correct":    correct,
            "topic":      topic,
            "difficulty": difficulty,
            "q_type":     q_type,
        }

    except Exception as e:
        logger.warning(f"[Validate] Question skipped — {type(e).__name__}: {e} | raw={str(q)[:120]}")
        return None


# =============================================================================
# DB save — fresh session, bulk insert, single transaction
# =============================================================================

async def _save_to_db(
    user_id: int,
    questions: List[dict],
    q_type_fallback: str,
    difficulty_fallback: str,
) -> dict:
    """
    Validate all questions, insert in ONE transaction, return result dict.

    Runs in asyncio.to_thread() so db I/O doesn't block the event loop.

    FIX BUG 1: Opens its own SessionLocal() — no dependency on the outer
               request's Depends(get_db) session.
    FIX BUG 2: db.add_all() + ONE db.commit() instead of N commits.
    FIX BUG 3: Every question validated before insert; bad ones skipped.
    FIX BUG 4: QuizSession + all Questions committed in a SINGLE transaction.
    """
    # ── Step 1: Validate all questions (in memory, no DB yet) ────────────────
    valid_questions = []
    skipped         = 0

    for i, q in enumerate(questions):
        clean = _validate_question(q, q_type_fallback, difficulty_fallback)
        if clean:
            valid_questions.append(clean)
        else:
            skipped += 1
            logger.warning(f"[Save] Question {i} failed validation — skipping")

    if not valid_questions:
        raise ValueError(f"All {len(questions)} questions failed validation. Nothing to save.")

    logger.info(f"[Save] {len(valid_questions)} valid, {skipped} skipped — beginning DB insert")

    # ── Step 2: Single transaction — session, questions, one commit ──────────
    db = SessionLocal()    # FIX BUG 1: fresh session, not from Depends
    try:
        # Create session row
        quiz_session = QuizSession(user_id=user_id)
        db.add(quiz_session)
        db.flush()   # assigns quiz_session.id without committing yet

        # Build all Question objects in memory
        question_objs = [
            Question(
                question        = vq["question"],
                options         = vq["options_json"],
                correct         = vq["correct"],
                topic           = vq["topic"],
                difficulty      = vq["difficulty"],
                q_type          = vq["q_type"],
                quiz_session_id = quiz_session.id,
            )
            for vq in valid_questions
        ]

        # FIX BUG 2: ONE bulk insert, ONE commit — not N individual commits
        db.add_all(question_objs)
        db.commit()   # commits quiz_session + all questions atomically (FIX BUG 4)

        # Refresh to get assigned IDs
        db.refresh(quiz_session)
        for obj in question_objs:
            db.refresh(obj)

        logger.info(f"[Save] ✓ Committed {len(question_objs)} questions — session_id={quiz_session.id}")

        # Build response payload
        saved = []
        for obj, vq in zip(question_objs, valid_questions):
            saved.append({
                "id":         obj.id,
                "question":   obj.question,
                "options":    vq["options"],    # already a list — no need to re-parse
                "correct":    obj.correct,
                "topic":      obj.topic,
                "difficulty": obj.difficulty,
                "type":       obj.q_type,
            })

        return {
            "quiz_session_id": quiz_session.id,
            "saved":           len(saved),
            "skipped":         skipped,
            "questions":       saved,
        }

    except Exception:
        db.rollback()   # if anything failed, rollback everything (FIX BUG 4)
        raise

    finally:
        db.close()   # always close — no session leak


# =============================================================================
# /generate — SSE streaming endpoint (save-stable version)
# =============================================================================

@router.post("/generate")
async def generate_quiz(
    num_questions: int = 5,
    q_type: str = "MCQ",
    difficulty: str = "Medium",
    topic: Optional[str] = None,
    file: UploadFile = File(...),
    current_username: str = Depends(get_current_user),   # FIX BUG 1: no db here
):
    # ── Auth ──────────────────────────────────────────────────────────────────
    current_user = _get_user_from_db(current_username)
    if not current_user:
        raise HTTPException(status_code=401, detail="User not found")

    # ── File validation ───────────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large ({len(file_bytes)//(1024*1024)}MB). Max: 25MB."
        )

    # ── PDF extraction (blocking → thread) ───────────────────────────────────
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

    # ── Cap question count ────────────────────────────────────────────────────
    word_count = len(text.split())
    if word_count < 200:       max_q = 5
    elif word_count < 500:     max_q = 10
    elif word_count < 1000:    max_q = 20
    elif word_count < 2000:    max_q = 40
    else:                      max_q = min(100, word_count // 60)

    capped       = min(num_questions, max_q)
    chunks       = split_into_chunks(text)
    total_chunks = max(len(chunks), 1)

    user_id = current_user.id   # capture before generator runs

    # ── SSE event stream ──────────────────────────────────────────────────────
    async def event_stream():
        progress_queue: asyncio.Queue = asyncio.Queue()

        # First bytes on the wire — resets Render's 30s idle timer immediately
        yield _sse({
            "event":         "start",
            "total_chunks":  total_chunks,
            "num_questions": capped,
            "word_count":    word_count,
        })

        gen_task = asyncio.create_task(
            generate_quiz_streaming(text, capped, q_type, difficulty, topic, progress_queue)
        )

        chunks_done  = 0
        last_event_t = time.monotonic()

        try:
            # ── Stream chunk progress events ──────────────────────────────────
            while not gen_task.done() or not progress_queue.empty():
                try:
                    item = await asyncio.wait_for(
                        progress_queue.get(),
                        timeout=SSE_HEARTBEAT_S,
                    )
                    chunks_done += 1
                    last_event_t = time.monotonic()
                    yield _sse({
                        "event":     "chunk",
                        "chunk_idx": item.get("chunk_idx", chunks_done - 1),
                        "q_type":    item.get("q_type", q_type),
                        "count":     len(item.get("questions", [])),
                        "done":      chunks_done,
                        "of":        total_chunks,
                    })
                except asyncio.TimeoutError:
                    logger.debug(f"[SSE] Heartbeat — {time.monotonic() - last_event_t:.0f}s since last chunk")
                    yield _sse_heartbeat()

            # ── Get final question list ───────────────────────────────────────
            try:
                final_questions = gen_task.result()
            except Exception as task_exc:
                logger.error(f"[SSE] Generation task raised: {task_exc}")
                yield _sse({"event": "error", "message": str(task_exc)})
                return

            questions = final_questions or []
            if not questions:
                yield _sse({
                    "event":   "error",
                    "message": f"AI returned no questions. Try fewer questions (max for this PDF: {max_q})."
                })
                return

            # ── Save to DB (FIX BUG 1+2+3+4): runs in thread pool ────────────
            # _save_to_db opens its own session — completely decoupled from
            # FastAPI's Depends lifecycle. The session is created, used,
            # committed, and closed entirely within asyncio.to_thread().
            try:
                save_result = await asyncio.to_thread(
                    _save_to_db,
                    user_id,
                    questions,
                    q_type,
                    difficulty,
                )
            except ValueError as ve:
                # All questions failed validation
                logger.error(f"[SSE] Validation error: {ve}")
                yield _sse({"event": "error", "message": str(ve)})
                return
            except Exception as db_exc:
                # Real DB error — log with full traceback
                logger.error(f"[SSE] DB save failed: {type(db_exc).__name__}: {db_exc}", exc_info=True)
                yield _sse({
                    "event":   "error",
                    "message": f"Failed to save questions: {type(db_exc).__name__}. Please try again.",
                })
                return

            # ── Emit done event ───────────────────────────────────────────────
            skipped_count = save_result["skipped"]
            if skipped_count > 0:
                logger.warning(f"[SSE] {skipped_count} questions skipped during validation")

            yield _sse({
                "event":           "done",
                "quiz_session_id": save_result["quiz_session_id"],
                "total":           save_result["saved"],
                "skipped":         skipped_count,
                "max_questions":   max_q,
                "word_count":      word_count,
                "questions":       save_result["questions"],
            })

        except Exception as exc:
            logger.error(f"[SSE] Unexpected error in event_stream: {exc}", exc_info=True)
            if not gen_task.done():
                gen_task.cancel()
            yield _sse({"event": "error", "message": "Generation failed unexpectedly. Please try again."})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# =============================================================================
# /analyze
# =============================================================================

@router.post("/analyze")
async def analyze_pdf(
    file: UploadFile = File(...),
    current_username: str = Depends(get_current_user),
):
    # verify user exists
    user = _get_user_from_db(current_username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="PDF too large. Max: 25MB.")

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

    return {
        "word_count":          word_count,
        "char_count":          char_count,
        "page_count":          meta.get("page_count", 0),
        "size_mb":             meta.get("size_mb", 0),
        "max_questions":       max_q,
        "detected_difficulty": difficulty,
        "topics":              topics,
        "chunk_count":         len(split_into_chunks(text)),
        "estimated_batches":   len(split_into_chunks(text)),
    }


# =============================================================================
# /history
# =============================================================================

@router.get("/history")
def get_quiz_history(current_username: str = Depends(get_current_user)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == current_username).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        sessions = (
            db.query(QuizSession)
            .filter(QuizSession.user_id == user.id)
            .order_by(QuizSession.id.desc())
            .all()
        )
        result = []
        for session in sessions:
            qs = [
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
                "total_questions": len(qs),
                "questions":       qs,
            })
        return {"total_sessions": len(result), "generated_by": current_username, "sessions": result}
    finally:
        db.close()


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
    current_username: str = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == current_username).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        session = db.query(QuizSession).filter(
            QuizSession.id == request.quiz_session_id,
            QuizSession.user_id == user.id
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
    finally:
        db.close()


# =============================================================================
# /leaderboard
# =============================================================================

@router.get("/leaderboard")
def get_leaderboard(current_username: str = Depends(get_current_user)):
    from sqlalchemy import func
    db = SessionLocal()
    try:
        subq = (
            db.query(
                QuizSession.user_id,
                func.max(QuizSession.percentage).label("best_pct"),
                func.sum(QuizSession.total_questions).label("total_questions")
            )
            .filter(QuizSession.percentage.isnot(None))
            .group_by(QuizSession.user_id)
            .subquery()
        )
        rows = (
            db.query(User.username, subq.c.best_pct, subq.c.total_questions)
            .join(subq, User.id == subq.c.user_id)
            .order_by(subq.c.best_pct.desc())
            .limit(10)
            .all()
        )
        return {
            "leaderboard": [
                {"username": r.username, "percentage": round(r.best_pct, 1), "questions": r.total_questions or 0}
                for r in rows
            ]
        }
    finally:
        db.close()


# =============================================================================
# /ask-tutor
# =============================================================================

class TutorRequest(BaseModel):
    question: str
    context: str = ""
    history: List[dict] = []


@router.post("/ask-tutor")
async def ask_tutor(req: TutorRequest, current_username: str = Depends(get_current_user)):
    user = _get_user_from_db(current_username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    try:
        from groq import Groq
        from core.config import GROQ_API_KEY
        groq_client = Groq(api_key=GROQ_API_KEY)
        system_msg  = (
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
            groq_client.chat.completions.create,
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.5,
            max_tokens=512,
        )
        return {"answer": response.choices[0].message.content.strip()}
    except Exception as e:
        logger.error(f"AI Tutor error: {e}")
        raise HTTPException(status_code=500, detail="AI Tutor temporarily unavailable.")
