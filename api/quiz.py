"""
api/quiz.py — Quiz API Router (v6 — crash-free save)

"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.generator import generate_quiz_streaming, split_into_chunks
from core.pdf import extract_text_from_pdf, get_pdf_metadata
from db.database import SessionLocal
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
SSE_HEARTBEAT_S     = 20
MAX_OPTION_LEN      = 200
MAX_QUESTION_LEN    = 1000


# =============================================================================
# Auth helpers
# =============================================================================

def get_current_user(username: str = Depends(verify_token)):
    return username


def _get_user_from_db(username: str) -> Optional[User]:
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
    try:
        question_text = str(q.get("question", "")).strip()
        if not question_text or len(question_text) < 5:
            logger.warning(f"[Validate] Rejected: question text too short — {repr(question_text[:60])}")
            return None

        options = q.get("options")
        if not isinstance(options, list) or len(options) < 2:
            logger.warning(f"[Validate] Rejected: invalid options — {repr(options)[:80]}")
            return None

        clean_options = []
        for opt in options[:6]:
            opt_str = str(opt).strip()
            if not opt_str:
                logger.warning(f"[Validate] Rejected: empty option in {repr(options)[:80]}")
                return None
            if len(opt_str) > MAX_OPTION_LEN:
                opt_str = opt_str[:MAX_OPTION_LEN - 3] + "..."
            clean_options.append(opt_str)

        correct     = _normalize_correct(q.get("correct", "A"))
        correct_idx = _LABELS.index(correct) if correct in _LABELS else 0
        if correct_idx >= len(clean_options):
            correct = _LABELS[0]

        topic      = str(q.get("topic", "General")).strip()[:100] or "General"
        difficulty = str(q.get("difficulty", difficulty_fallback)).strip()[:20] or difficulty_fallback
        q_type     = str(q.get("type", q_type_fallback)).strip().upper()[:10] or q_type_fallback
        if q_type not in ("MCQ", "TF", "FIB"):
            q_type = q_type_fallback

        if len(question_text) > MAX_QUESTION_LEN:
            question_text = question_text[:MAX_QUESTION_LEN - 3] + "..."

        options_json = json.dumps(clean_options, ensure_ascii=False)

        return {
            "question":     question_text,
            "options":      clean_options,
            "options_json": options_json,
            "correct":      correct,
            "topic":        topic,
            "difficulty":   difficulty,
            "q_type":       q_type,
        }

    except Exception as e:
        logger.warning(
            f"[Validate] Question skipped — {type(e).__name__}: {e} | raw={str(q)[:120]}",
            exc_info=True,
        )
        return None


# =============================================================================
# DB save — THE CRITICAL FIX IS HERE
# =============================================================================

def _save_to_db(                     # ← FIX: was `async def` — see module docstring
    user_id: int,
    questions: List[dict],
    q_type_fallback: str,
    difficulty_fallback: str,
) -> dict:
    """
    Synchronous DB save. Called via asyncio.to_thread() in the SSE generator.

    THE FIX: This must be a plain `def`, not `async def`.
      asyncio.to_thread(fn, *args) runs fn(*args) in a thread pool.
      If fn is `async def`, fn(*args) returns a coroutine object, not a result.
      The coroutine is never awaited → RuntimeWarning + TypeError on the result.
      Making this a plain synchronous function means it runs SQLAlchemy I/O
      in the thread pool (correct usage) and returns the actual dict result.

    All SQLAlchemy operations here are synchronous — no `await` is needed or
    possible in a plain `def`. This is correct: SQLAlchemy's synchronous API
    must not be awaited.
    """
    logger.info(f"[Save] Starting DB save — {len(questions)} questions, user_id={user_id}")

    # Step 1: Validate
    valid_questions = []
    skipped = 0
    for i, q in enumerate(questions):
        clean = _validate_question(q, q_type_fallback, difficulty_fallback)
        if clean:
            valid_questions.append(clean)
        else:
            skipped += 1

    logger.info(f"[Save] Validation complete — valid={len(valid_questions)} skipped={skipped}")

    if not valid_questions:
        raise ValueError(
            f"All {len(questions)} questions failed validation. "
            f"The AI may have returned malformed output. Try regenerating."
        )

    # Step 2: Single atomic transaction
    db = SessionLocal()
    try:
        quiz_session = QuizSession(user_id=user_id)
        db.add(quiz_session)
        db.flush()   # get quiz_session.id without committing

        logger.info(f"[Save] QuizSession flushed — id={quiz_session.id}")

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

        db.add_all(question_objs)
        db.commit()   # single commit — atomic
        logger.info(f"[Save] ✓ Committed {len(question_objs)} questions, session_id={quiz_session.id}")

        db.refresh(quiz_session)
        for obj in question_objs:
            db.refresh(obj)

        saved = [
            {
                "id":         obj.id,
                "question":   obj.question,
                "options":    vq["options"],
                "correct":    obj.correct,
                "topic":      obj.topic,
                "difficulty": obj.difficulty,
                "type":       obj.q_type,
            }
            for obj, vq in zip(question_objs, valid_questions)
        ]

        return {
            "quiz_session_id": quiz_session.id,
            "saved":           len(saved),
            "skipped":         skipped,
            "questions":       saved,
        }

    except Exception as e:
        db.rollback()
        logger.error(f"[Save] DB error — {type(e).__name__}: {e}", exc_info=True)
        raise

    finally:
        db.close()


# =============================================================================
# /generate — SSE streaming endpoint
# =============================================================================

@router.post("/generate")
async def generate_quiz(
    num_questions: int = 5,
    q_type: str = "MCQ",
    difficulty: str = "Medium",
    topic: Optional[str] = None,
    file: UploadFile = File(...),
    current_username: str = Depends(get_current_user),
):
    logger.info(f"[Generate] Request — user={current_username} n={num_questions} type={q_type} diff={difficulty} topic={topic}")

    current_user = _get_user_from_db(current_username)
    if not current_user:
        raise HTTPException(status_code=401, detail="User not found")

    file_bytes = await file.read()
    file_size  = len(file_bytes)
    logger.info(f"[Generate] File received — size={file_size/1024:.1f}KB name={file.filename}")

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF too large ({file_size//(1024*1024)}MB). Max: 25MB.")

    logger.info("[Generate] Extracting PDF text")
    try:
        text = await asyncio.to_thread(extract_text_from_pdf, file_bytes)
    except Exception as e:
        logger.error(f"[Generate] PDF extraction failed — {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Could not extract text from PDF: {e}")
    del file_bytes

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found. PDF may be scanned/image-based.")

    word_count = len(text.split())
    logger.info(f"[Generate] PDF extracted — words={word_count}")

    if word_count < 200:       max_q = 5
    elif word_count < 500:     max_q = 10
    elif word_count < 1000:    max_q = 20
    elif word_count < 2000:    max_q = 40
    else:                      max_q = min(100, word_count // 60)

    capped       = min(num_questions, max_q)
    chunks       = split_into_chunks(text)
    total_chunks = max(len(chunks), 1)

    logger.info(f"[Generate] Chunked — chunks={total_chunks} capped_q={capped} max_q={max_q}")

    user_id = current_user.id

    async def event_stream():
        progress_queue: asyncio.Queue = asyncio.Queue()

        yield _sse({
            "event":         "start",
            "total_chunks":  total_chunks,
            "num_questions": capped,
            "word_count":    word_count,
        })
        logger.info("[SSE] start event sent")

        gen_task = asyncio.create_task(
            generate_quiz_streaming(text, capped, q_type, difficulty, topic, progress_queue)
        )

        chunks_done  = 0
        last_event_t = time.monotonic()

        try:
            while not gen_task.done() or not progress_queue.empty():
                try:
                    item = await asyncio.wait_for(progress_queue.get(), timeout=SSE_HEARTBEAT_S)
                    chunks_done += 1
                    last_event_t = time.monotonic()
                    logger.info(
                        f"[SSE] chunk event — {chunks_done}/{total_chunks} "
                        f"questions={len(item.get('questions', []))} type={item.get('q_type')}"
                    )
                    yield _sse({
                        "event":     "chunk",
                        "chunk_idx": item.get("chunk_idx", chunks_done - 1),
                        "q_type":    item.get("q_type", q_type),
                        "count":     len(item.get("questions", [])),
                        "done":      chunks_done,
                        "of":        total_chunks,
                    })
                except asyncio.TimeoutError:
                    elapsed = time.monotonic() - last_event_t
                    logger.info(f"[SSE] heartbeat — {elapsed:.0f}s since last chunk")
                    yield _sse_heartbeat()

            # Generation done — get result
            try:
                final_questions = gen_task.result()
                logger.info(f"[SSE] Generation complete — {len(final_questions or [])} questions returned")
            except Exception as task_exc:
                logger.error(
                    f"[SSE] Generation task raised — {type(task_exc).__name__}: {task_exc}",
                    exc_info=True,
                )
                yield _sse({"event": "error", "message": f"AI generation failed: {type(task_exc).__name__}: {task_exc}"})
                return

            questions = final_questions or []
            if not questions:
                logger.warning(f"[SSE] No questions returned — max_q={max_q}")
                yield _sse({"event": "error", "message": f"AI returned no questions. Max for this PDF: {max_q}. Try fewer questions."})
                return

            logger.info(f"[SSE] Saving {len(questions)} questions to DB")

            try:
                # ── THE FIX ──────────────────────────────────────────────────
                # asyncio.to_thread() runs a SYNCHRONOUS function in a thread.
                # _save_to_db is now `def` (not `async def`) so it runs correctly
                # in the thread and returns its dict result directly.
                # Before this fix, calling async_fn in to_thread returned a
                # coroutine object → TypeError on result access → crash.
                save_result = await asyncio.to_thread(
                    _save_to_db,           # plain def — correct
                    user_id,
                    questions,
                    q_type,
                    difficulty,
                )
            except ValueError as ve:
                logger.error(f"[SSE] Validation failure: {ve}")
                yield _sse({"event": "error", "message": str(ve)})
                return
            except Exception as db_exc:
                logger.error(
                    f"[SSE] DB save failed — {type(db_exc).__name__}: {db_exc}",
                    exc_info=True,
                )
                yield _sse({
                    "event":   "error",
                    "message": f"Save failed: {type(db_exc).__name__}: {db_exc}",
                })
                return

            logger.info(
                f"[SSE] Save complete — session_id={save_result['quiz_session_id']} "
                f"saved={save_result['saved']} skipped={save_result['skipped']}"
            )

            yield _sse({
                "event":           "done",
                "quiz_session_id": save_result["quiz_session_id"],
                "total":           save_result["saved"],
                "skipped":         save_result["skipped"],
                "max_questions":   max_q,
                "word_count":      word_count,
                "questions":       save_result["questions"],
            })

        except Exception as exc:
            logger.error(
                f"[SSE] Unexpected error in event_stream — {type(exc).__name__}: {exc}",
                exc_info=True,
            )
            if not gen_task.done():
                gen_task.cancel()
            yield _sse({
                "event":   "error",
                "message": f"Unexpected error: {type(exc).__name__}: {exc}",
            })

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
    except Exception as e:
        logger.error(f"[Analyze] Failed — {type(e).__name__}: {e}", exc_info=True)
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

    heading_pattern = re.compile(r'^[A-Z][A-Za-z &\-:,]{3,60}$')
    topics = []
    for line in text.split("\n"):
        line = line.strip()
        if heading_pattern.match(line) and len(line.split()) <= 8:
            topics.append(line)
        if len(topics) >= 8:
            break

    chunk_count = len(split_into_chunks(text))
    logger.info(f"[Analyze] words={word_count} max_q={max_q} chunks={chunk_count} diff={difficulty}")

    return {
        "word_count": word_count, "char_count": char_count,
        "page_count": meta.get("page_count", 0), "size_mb": meta.get("size_mb", 0),
        "max_questions": max_q, "detected_difficulty": difficulty,
        "topics": topics, "chunk_count": chunk_count, "estimated_batches": chunk_count,
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
                    "topic": q.topic, "difficulty": q.difficulty, "type": q.q_type or "MCQ",
                }
                for q in session.questions
            ]
            result.append({
                "quiz_session_id": session.id, "created_at": session.created_at,
                "total_questions": len(qs), "questions": qs,
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
def attempt_quiz(request: AttemptRequest, current_username: str = Depends(get_current_user)):
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
            q = db.query(Question).filter(
                Question.id == ans.question_id,
                Question.quiz_session_id == session.id
            ).first()
            if not q:
                continue
            is_correct = ans.selected == q.correct
            if is_correct: score += 1
            results.append({
                "question_id": q.id, "question_text": q.question,
                "options": json.loads(q.options), "selected": ans.selected,
                "correct": q.correct, "is_correct": is_correct,
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
        logger.error(f"[Tutor] Error — {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI Tutor temporarily unavailable.")
