"""
core/generator.py — SSE-Streaming MCQ Generator (v6)
"""

import json
import asyncio
import re
import logging
import time
from typing import List, Optional

from groq import Groq
from core.config import GROQ_API_KEY
from core.chunker import chunk_text_list

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
MODEL_NAME         = "llama-3.3-70b-versatile"
MAX_PARALLEL       = 5
MAX_RETRIES        = 2
LLM_CALL_TIMEOUT_S = 55
MAX_CHUNK_CHARS    = 9000

TIMEOUT_BACKOFF    = [3, 8]
RATE_LIMIT_BACKOFF = [62]
OTHER_BACKOFF      = [5, 15]

client = Groq(api_key=GROQ_API_KEY)

_llm_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _llm_semaphore
    if _llm_semaphore is None:
        _llm_semaphore = asyncio.Semaphore(MAX_PARALLEL)
    return _llm_semaphore


# ─────────────────────────────────────────────────────────────────────────────
# Chunking helpers
# ─────────────────────────────────────────────────────────────────────────────

def split_into_chunks(text: str) -> List[str]:
    return chunk_text_list(text)


def distribute_questions(total: int, num_chunks: int) -> List[int]:
    base  = total // num_chunks
    extra = total % num_chunks
    return [base + (1 if i < extra else 0) for i in range(num_chunks)]


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def build_prompt(
    context: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> str:
    level = {"Easy": "basic recall", "Medium": "comprehension", "Hard": "analysis"}.get(difficulty, "comprehension")
    ctx   = context[:MAX_CHUNK_CHARS]
    topic_line = f"Focus only on '{topic}'.\n" if topic else ""
    schema = '{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"' + q_type + '"}'

    if q_type == "TF":
        schema = '{"question":"...","options":["A) True","B) False"],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"TF"}'
        return (f"{topic_line}Generate {num_questions} True/False questions at {level} level.\n"
                f"Return ONLY a JSON array of objects matching: {schema}\nNo markdown.\n\nContext:\n{ctx}")
    if q_type == "FIB":
        schema = '{"question":"The ___ ...","options":["A) correct","B) wrong","C) wrong","D) wrong"],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"FIB"}'
        return (f"{topic_line}Generate {num_questions} fill-in-the-blank MCQ questions at {level} level. Use ___ for the blank.\n"
                f"Return ONLY a JSON array of objects matching: {schema}\nNo markdown.\n\nContext:\n{ctx}")
    return (f"{topic_line}Generate {num_questions} MCQ questions at {level} level.\n"
            f"Return ONLY a JSON array of objects matching: {schema}\n"
            f"Options max 60 chars. Prefix: A) B) C) D). No markdown.\n\nContext:\n{ctx}")


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_json(text: str) -> List[dict]:
    try:
        return json.loads(text.strip())
    except Exception:
        pass
    text = re.sub(r"```(?:json)?", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("[")
    if start == -1:
        return []
    depth, end = 0, -1
    for i in range(start, len(text)):
        if text[i] == "[":    depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end == -1:
        idx = text.rfind("]")
        end = idx + 1 if idx != -1 else -1
    if end == -1:
        return []
    candidate = text[start:end]
    try:
        r = json.loads(candidate)
        if isinstance(r, list):
            return r
    except Exception:
        pass
    partial, depth, obj_start = [], 0, -1
    for i, ch in enumerate(candidate):
        if ch == "{":
            if depth == 0: obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start != -1:
                try:
                    obj = json.loads(candidate[obj_start:i + 1])
                    if isinstance(obj, dict): partial.append(obj)
                except Exception:
                    pass
                obj_start = -1
    return partial


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation
# ─────────────────────────────────────────────────────────────────────────────
LABELS = ["A", "B", "C", "D", "E", "F"]


def _normalize_options(options: list) -> list:
    if not options: return options
    first = str(options[0]).strip()
    has_prefix = len(first) > 1 and first[0].upper() in LABELS and first[1] in (")", ".", " ", ":")
    result = []
    for i, opt in enumerate(options[:len(LABELS)]):
        s    = str(opt).strip()
        text = re.sub(r"^[A-Fa-f\d][).\s:]\s*", "", s).strip() if has_prefix else s
        if len(text) > 80: text = text[:77] + "..."
        result.append(f"{LABELS[i]}) {text}")
    return result


def _normalize_correct(correct) -> str:
    s = str(correct).strip()
    if not s: return "A"
    first = s[0].upper()
    if first in LABELS: return first
    if s[0].isdigit():
        idx = int(s[0]) - 1
        return LABELS[idx] if 0 <= idx < len(LABELS) else "A"
    return "A"


# ─────────────────────────────────────────────────────────────────────────────
# Error classification + backoff
# ─────────────────────────────────────────────────────────────────────────────

def _classify_error(exc: Exception) -> str:
    if isinstance(exc, (asyncio.TimeoutError, asyncio.CancelledError)):
        return "timeout"
    if "RateLimit" in type(exc).__name__:
        return "rate_limit"
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status == 429 or "429" in str(exc) or "rate limit" in str(exc).lower():
        return "rate_limit"
    return "other"


def _get_backoff(error_class: str, attempt: int, exc: Exception) -> float:
    if error_class == "rate_limit":
        headers   = getattr(getattr(exc, "response", None), "headers", {}) or {}
        retry_hdr = headers.get("retry-after")
        try:
            return float(retry_hdr) if retry_hdr else RATE_LIMIT_BACKOFF[min(attempt, len(RATE_LIMIT_BACKOFF) - 1)]
        except (ValueError, TypeError):
            return RATE_LIMIT_BACKOFF[min(attempt, len(RATE_LIMIT_BACKOFF) - 1)]
    if error_class == "timeout":
        return TIMEOUT_BACKOFF[min(attempt, len(TIMEOUT_BACKOFF) - 1)]
    return OTHER_BACKOFF[min(attempt, len(OTHER_BACKOFF) - 1)]


# ─────────────────────────────────────────────────────────────────────────────
# Core LLM call
# ─────────────────────────────────────────────────────────────────────────────

async def _call_llm(
    chunk_text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    chunk_idx: int,
    topic: Optional[str] = None,
) -> List[dict]:
    prompt    = build_prompt(chunk_text, num_questions, q_type, difficulty, topic)
    semaphore = _get_semaphore()

    for attempt in range(MAX_RETRIES + 1):
        t_start   = time.monotonic()
        last_exc  = None
        succeeded = False

        async with semaphore:
            try:
                logger.info(f"[Chunk {chunk_idx}][{q_type}] attempt {attempt + 1} — {num_questions}q")
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.chat.completions.create,
                        model=MODEL_NAME,
                        messages=[
                            {"role": "system", "content": (
                                "You are an expert quiz generator. "
                                "Respond ONLY with a valid JSON array starting with '[' and ending with ']'. "
                                "No markdown. No text outside the array. Options under 60 chars each."
                            )},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.4,
                        max_tokens=4096,
                    ),
                    timeout=LLM_CALL_TIMEOUT_S,
                )

                content   = response.choices[0].message.content
                questions = extract_json(content)

                valid = []
                for q in questions:
                    if isinstance(q, dict) and q.get("question") and q.get("options") and q.get("correct"):
                        q.setdefault("type", q_type)
                        q["options"] = _normalize_options(q["options"])
                        q["correct"] = _normalize_correct(q["correct"])
                        valid.append(q)

                logger.info(f"[Chunk {chunk_idx}][{q_type}] ✓ {len(valid)}q in {time.monotonic()-t_start:.1f}s")
                succeeded = True
                return valid

            except Exception as e:
                last_exc  = e
                err_class = _classify_error(e)
                logger.warning(f"[Chunk {chunk_idx}][{q_type}] ✗ {err_class} after {time.monotonic()-t_start:.1f}s: {type(e).__name__}")

        if attempt >= MAX_RETRIES or succeeded:
            break
        wait = _get_backoff(_classify_error(last_exc), attempt, last_exc)
        logger.warning(f"[Chunk {chunk_idx}][{q_type}] sleeping {wait}s before retry")
        await asyncio.sleep(wait)

    if not succeeded:
        logger.error(f"[Chunk {chunk_idx}][{q_type}] SKIPPED after {MAX_RETRIES+1} attempts")
    return []


# ─────────────────────────────────────────────────────────────────────────────
# SSE-aware chunk runner (NEW in v6)
# ─────────────────────────────────────────────────────────────────────────────

async def _call_llm_queued(
    chunk_text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    chunk_idx: int,
    topic: Optional[str],
    progress_queue: asyncio.Queue,
) -> List[dict]:
    """
    Wrapper around _call_llm that puts a progress update into progress_queue
    as soon as this chunk's result is ready.

    This is the key mechanism that keeps the SSE connection alive:
    the endpoint reads from the queue and sends an SSE event for each
    completed chunk. Each event is bytes on the wire, resetting Render's
    30-second idle proxy timeout.
    """
    result = await _call_llm(chunk_text, num_questions, q_type, difficulty, chunk_idx, topic)
    await progress_queue.put({
        "event":     "chunk",
        "chunk_idx": chunk_idx,
        "q_type":    q_type,
        "count":     len(result),
        "questions": result,
    })
    return result


async def _run_all_chunks_streaming(
    chunks: List[str],
    q_per_chunk: List[int],
    q_type: str,
    difficulty: str,
    topic: Optional[str],
    progress_queue: asyncio.Queue,
) -> List[dict]:
    """
    Submit all chunks simultaneously. Each task puts its result into
    progress_queue as soon as it finishes (no waiting for other tasks).
    The semaphore inside _call_llm limits concurrency to MAX_PARALLEL.
    """
    tasks = [
        _call_llm_queued(chunk, q_count, q_type, difficulty, idx, topic, progress_queue)
        for idx, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]

    logger.info(f"[Pipeline][{q_type}] {len(tasks)} tasks — semaphore={MAX_PARALLEL}")
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_questions: List[dict] = []
    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            logger.error(f"[Chunk {i}][{q_type}] escaped gather: {result}")
        elif isinstance(result, list):
            all_questions.extend(result)

    return all_questions


# ─────────────────────────────────────────────────────────────────────────────
# Public streaming API (used by /quiz/generate SSE endpoint)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_quiz_streaming(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str],
    progress_queue: asyncio.Queue,
) -> List[dict]:
    """
    Generate MCQs and report progress via progress_queue.

    The caller (streaming endpoint) reads from progress_queue and sends
    SSE events. Each event keeps Render's proxy connection alive.

    Sentinel: after all questions are ready, caller receives the full
    question list as the return value of this coroutine.
    """
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]

    async def _single_type(text: str, n: int, qt: str) -> List[dict]:
        chunks = await asyncio.to_thread(chunk_text_list, text)
        if not chunks:
            return []
        if len(chunks) == 1:
            return await _call_llm_queued(chunks[0], n, qt, difficulty, 0, topic, progress_queue)
        q_per_chunk   = distribute_questions(n, len(chunks))
        all_questions = await _run_all_chunks_streaming(chunks, q_per_chunk, qt, difficulty, topic, progress_queue)
        # Deduplicate
        seen, deduped = set(), []
        for q in all_questions:
            key = q["question"].strip().lower()
            if key not in seen:
                seen.add(key)
                deduped.append(q)
        return deduped

    if len(types) <= 1:
        return await _single_type(text, num_questions, q_type.upper())

    base   = num_questions // len(types)
    extras = num_questions % len(types)
    counts = [base + (1 if i < extras else 0) for i in range(len(types))]

    type_tasks = [
        _single_type(text, count, t)
        for t, count in zip(types, counts)
        if count > 0
    ]

    type_results = await asyncio.gather(*type_tasks, return_exceptions=True)

    all_questions: List[dict] = []
    for i, result in enumerate(type_results):
        if isinstance(result, BaseException):
            logger.error(f"[Type {types[i]}] pipeline failed: {result}")
        else:
            all_questions.extend(result)

    return all_questions


# ─────────────────────────────────────────────────────────────────────────────
# Non-streaming API (kept for compatibility)
# ─────────────────────────────────────────────────────────────────────────────

async def _run_all_chunks(
    chunks: List[str],
    q_per_chunk: List[int],
    q_type: str,
    difficulty: str,
    topic: Optional[str],
) -> List[dict]:
    tasks = [
        _call_llm(chunk, q_count, q_type, difficulty, idx, topic)
        for idx, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    all_questions: List[dict] = []
    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            logger.error(f"[Chunk {i}][{q_type}] escaped gather: {result}")
        elif isinstance(result, list):
            all_questions.extend(result)
    return all_questions


async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    """Non-streaming version kept for backward compatibility."""
    queue = asyncio.Queue()   # discard progress events
    return await generate_quiz_streaming(text, num_questions, q_type, difficulty, topic, queue)
