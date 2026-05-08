"""
core/generator.py — Scalable Parallel Chunked MCQ Generator (v3 — large-PDF stable)
=====================================================================================

ROOT CAUSES FIXED IN THIS FILE
───────────────────────────────
BUG 1 — Synchronous chunk_text_list() blocks the asyncio event loop
  LOCATION : _generate_single(), was `chunks = chunk_text_list(text)`
  SYMPTOM  : For a large PDF (10,000+ words of extracted text), the chunker
             iterates every sentence with regex. Pure CPU work on the event loop
             thread freezes it for 0.5–3 seconds. Render health checks get no
             response → dyno marked unhealthy → restarted → job gone.
  FIX      : chunks = await asyncio.to_thread(chunk_text_list, text)

BUG 2 — Groq rate-limit (429) retry backoff is 1s / 2s — far too short
  SYMPTOM  : Large PDFs with 20 chunks → 80+ LLM calls. After ~30, Groq returns
             429. Old retry waited 2^0=1s then 2^1=2s — both still within the
             60-second window → all retries fail → chunk skipped → 0 questions
             → HTTP 500.
  FIX      : 429 errors now wait RATE_LIMIT_WAIT_S=65s (slightly over the
             60s window). Other errors use [5, 15, 30]s backoff. MAX_RETRIES
             increased to 3.

BUG 3 — topic parameter was not threaded through the generation pipeline
  FIX      : Added `topic: Optional[str]` through generate_quiz_from_text →
             _generate_single → _call_llm → build_prompt.
"""

import json
import asyncio
import re
import logging
from typing import List, Optional

from groq import Groq
from core.config import GROQ_API_KEY
from core.chunker import chunk_text_list

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# LLM Configuration
# ─────────────────────────────────────────────────────────────────────────────
MODEL_NAME        = "llama-3.3-70b-versatile"
MAX_PARALLEL      = 4       # concurrent Groq calls per batch
MAX_RETRIES       = 3       # FIX BUG 2: was 2
RATE_LIMIT_WAIT_S = 65      # FIX BUG 2: wait on 429 (>60s rate-limit window)
OTHER_ERROR_WAIT  = [5, 15, 30]   # seconds for attempt 0, 1, 2 on non-429 errors
MAX_CHUNK_CHARS   = 6000    # hard cap per chunk sent to LLM (~1500 tokens)

client = Groq(api_key=GROQ_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Chunking (delegated to core/chunker.py)
# ─────────────────────────────────────────────────────────────────────────────

def split_into_chunks(text: str) -> List[str]:
    """Public interface used by quiz.py for chunk_count reporting."""
    return chunk_text_list(text)


def distribute_questions(total: int, num_chunks: int) -> List[int]:
    base  = total // num_chunks
    extra = total % num_chunks
    return [base + (1 if i < extra else 0) for i in range(num_chunks)]


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder (now topic-aware — FIX BUG 3)
# ─────────────────────────────────────────────────────────────────────────────

def build_prompt(
    context: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> str:
    level = {"Easy": "BASIC recall", "Medium": "COMPREHENSION", "Hard": "ANALYSIS"}.get(difficulty, "COMPREHENSION")
    ctx   = context[:MAX_CHUNK_CHARS]

    topic_instruction = (
        f"IMPORTANT: Focus exclusively on the topic '{topic}'. "
        f"Only generate questions directly about this topic.\n\n"
        if topic else ""
    )

    if q_type == "TF":
        return f"""{topic_instruction}Generate {num_questions} True/False questions at {level} level.

Return ONLY a valid JSON array. No markdown, no explanation.
Each object MUST have: question, options (always ["A) True", "B) False"]), correct ("A" or "B"), topic, difficulty, type.

[{{"question":"...","options":["A) True","B) False"],"correct":"A","topic":"topic","difficulty":"{difficulty}","type":"TF"}}]

Context:
{ctx}
"""
    if q_type == "FIB":
        return f"""{topic_instruction}Generate {num_questions} fill-in-the-blank MCQ questions at {level} level. Use ___ for the blank.

Return ONLY a valid JSON array. No markdown, no explanation.
Each object MUST have: question (with ___), options (4 choices A-D, A is correct), correct ("A"), topic, difficulty, type.

[{{"question":"The ___ is responsible for ATP.","options":["A) mitochondria","B) nucleus","C) ribosome","D) vacuole"],"correct":"A","topic":"topic","difficulty":"{difficulty}","type":"FIB"}}]

Context:
{ctx}
"""
    return f"""{topic_instruction}Generate {num_questions} MCQ questions at {level} level.

CRITICAL RULES:
- Return ONLY a valid JSON array. No markdown, no explanation.
- Each option MUST be a short label (max 60 characters).
- Every option string must start with: A), B), C), D)

[{{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","topic":"topic","difficulty":"{difficulty}","type":"MCQ"}}]

Context:
{ctx}
"""


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction (robust bracket-counting)
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
        c = text[i]
        if c == "[":    depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end == -1:
        end_idx = text.rfind("]")
        end = end_idx + 1 if end_idx != -1 else -1

    if end == -1:
        return []

    candidate = text[start:end]
    try:
        result = json.loads(candidate)
        if isinstance(result, list):
            return result
    except Exception:
        pass

    # Partial object recovery (truncated responses)
    partial, depth, obj_start = [], 0, -1
    for i, ch in enumerate(candidate):
        if ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start != -1:
                try:
                    obj = json.loads(candidate[obj_start: i + 1])
                    if isinstance(obj, dict):
                        partial.append(obj)
                except Exception:
                    pass
                obj_start = -1
    return partial


# ─────────────────────────────────────────────────────────────────────────────
# Option / correct normalisation
# ─────────────────────────────────────────────────────────────────────────────
LABELS = ["A", "B", "C", "D", "E", "F"]


def _normalize_options(options: list) -> list:
    if not options:
        return options
    first     = str(options[0]).strip()
    has_prefix = len(first) > 1 and first[0].upper() in LABELS and first[1] in (")", ".", " ", ":")

    if has_prefix:
        normalised = []
        for i, opt in enumerate(options):
            s     = str(opt).strip()
            label = LABELS[i] if i < len(LABELS) else str(i + 1)
            text  = re.sub(r"^[A-Fa-f\d][).\s:]\s*", "", s).strip()
            if len(text) > 80:
                text = text[:77] + "..."
            normalised.append(f"{label}) {text}")
        return normalised
    else:
        result = []
        for i in range(min(len(options), len(LABELS))):
            text = str(options[i]).strip()
            if len(text) > 80:
                text = text[:77] + "..."
            result.append(f"{LABELS[i]}) {text}")
        return result


def _normalize_correct(correct) -> str:
    s = str(correct).strip()
    if not s:
        return "A"
    first = s[0].upper()
    if first in LABELS:
        return first
    if s[0].isdigit():
        idx = int(s[0]) - 1
        return LABELS[idx] if 0 <= idx < len(LABELS) else "A"
    return "A"


# ─────────────────────────────────────────────────────────────────────────────
# Rate-limit detection helpers (FIX BUG 2)
# ─────────────────────────────────────────────────────────────────────────────

def _is_rate_limit_error(exc: Exception) -> bool:
    """Return True if exc is a Groq 429 RateLimitError."""
    if "RateLimit" in type(exc).__name__:
        return True
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status == 429:
        return True
    return "429" in str(exc) or "rate limit" in str(exc).lower()


def _get_retry_after(exc: Exception) -> Optional[int]:
    """Extract retry-after seconds from Groq exception headers, if present."""
    headers = getattr(getattr(exc, "response", None), "headers", {})
    retry_after = headers.get("retry-after") if headers else None
    if retry_after:
        try:
            return int(retry_after)
        except (ValueError, TypeError):
            pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Single chunk → LLM call (with smarter retry + backoff)
# ─────────────────────────────────────────────────────────────────────────────

async def _call_llm(
    chunk_text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    chunk_idx: int,
    topic: Optional[str] = None,
    retries: int = MAX_RETRIES,
) -> List[dict]:
    """
    Send one chunk to Groq. Retries up to `retries` times.

    FIX BUG 2: rate-limit errors now wait RATE_LIMIT_WAIT_S (65s) so the
    retry lands after Groq's 60-second window resets. Other errors use a
    short [5, 15, 30]s backoff. Returns empty list on exhaustion — never raises.
    """
    prompt = build_prompt(chunk_text, num_questions, q_type, difficulty, topic=topic)

    for attempt in range(retries + 1):
        try:
            logger.info(
                f"[Chunk {chunk_idx}] Generating {num_questions} {q_type} questions "
                f"(attempt {attempt + 1}/{retries + 1})"
            )
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert quiz generator. Always respond with ONLY a valid JSON array. "
                            "Never include markdown, explanations, or text outside the JSON array. "
                            "The response must start with '[' and end with ']'. "
                            "Keep each answer option under 60 characters."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=4096,
            )

            content   = response.choices[0].message.content
            questions = extract_json(content)

            valid = []
            for q in questions:
                if isinstance(q, dict) and q.get("question") and q.get("options") and q.get("correct"):
                    if not q.get("type"):
                        q["type"] = q_type
                    q["options"] = _normalize_options(q["options"])
                    q["correct"] = _normalize_correct(q["correct"])
                    valid.append(q)

            logger.info(f"[Chunk {chunk_idx}] Got {len(valid)} valid questions")
            return valid

        except Exception as e:
            if attempt >= retries:
                logger.error(
                    f"[Chunk {chunk_idx}] Failed after {retries + 1} attempts — skipping: {e}"
                )
                return []

            # ── FIX BUG 2: smart backoff based on error type ──────────────────
            if _is_rate_limit_error(e):
                wait = _get_retry_after(e) or RATE_LIMIT_WAIT_S
                logger.warning(
                    f"[Chunk {chunk_idx}] Groq 429 rate-limited. "
                    f"Waiting {wait}s before retry {attempt + 2}/{retries + 1}…"
                )
                await asyncio.sleep(wait)
            else:
                wait = OTHER_ERROR_WAIT[min(attempt, len(OTHER_ERROR_WAIT) - 1)]
                logger.warning(
                    f"[Chunk {chunk_idx}] Error (attempt {attempt + 1}): {e}. "
                    f"Retrying in {wait}s…"
                )
                await asyncio.sleep(wait)

    return []


# ─────────────────────────────────────────────────────────────────────────────
# Batched parallel execution
# ─────────────────────────────────────────────────────────────────────────────

async def _run_in_batches(
    tasks_args: list,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    all_questions: List[dict] = []

    for batch_start in range(0, len(tasks_args), MAX_PARALLEL):
        batch = tasks_args[batch_start: batch_start + MAX_PARALLEL]
        logger.info(
            f"[Batch] Processing chunks {batch_start}–{batch_start + len(batch) - 1} "
            f"of {len(tasks_args)}"
        )

        tasks = [
            _call_llm(chunk_text, num_q, q_type, difficulty, chunk_idx, topic=topic)
            for chunk_text, num_q, chunk_idx in batch
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            chunk_idx = batch[i][2]
            if isinstance(result, Exception):
                logger.error(f"[Chunk {chunk_idx}] Unexpected exception in gather: {result}")
            elif isinstance(result, list):
                all_questions.extend(result)

    return all_questions


# ─────────────────────────────────────────────────────────────────────────────
# Core public API — parallel chunked generation
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_single(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    """
    FIX BUG 1: chunk_text_list is synchronous CPU work. Moved to thread pool.
    FIX BUG 3: topic threaded through to _call_llm and build_prompt.
    """
    # FIX BUG 1: was `chunks = chunk_text_list(text)` — synchronous, blocked event loop
    chunks = await asyncio.to_thread(chunk_text_list, text)

    logger.info(
        f"\n====== PARALLEL GENERATION: {num_questions} {q_type} ({difficulty}) "
        f"| {len(chunks)} chunk(s) | topic={topic or 'all'} ======"
    )

    if not chunks:
        logger.warning("No chunks produced — text may be empty or too short")
        return []

    if len(chunks) == 1:
        return await _call_llm(
            chunks[0], num_questions, q_type, difficulty, chunk_idx=0, topic=topic
        )

    q_per_chunk = distribute_questions(num_questions, len(chunks))

    tasks_args = [
        (chunk, q_count, i)
        for i, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]

    all_questions = await _run_in_batches(tasks_args, q_type, difficulty, topic=topic)

    seen: set = set()
    deduped: List[dict] = []
    for q in all_questions:
        key = q["question"].strip().lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)

    logger.info(f"====== DONE: {len(deduped)} unique questions from {len(chunks)} chunks ======\n")
    return deduped


# ─────────────────────────────────────────────────────────────────────────────
# Multi-type wrapper
# ─────────────────────────────────────────────────────────────────────────────

async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    """
    Public entry point. Supports comma-separated q_type like 'MCQ,TF,FIB'.
    FIX BUG 3: topic param now flows all the way to the LLM prompt.
    """
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]
    if len(types) <= 1:
        return await _generate_single(
            text, num_questions, q_type.upper(), difficulty, topic=topic
        )

    base   = num_questions // len(types)
    extras = num_questions % len(types)
    counts = [base + (1 if i < extras else 0) for i in range(len(types))]

    type_tasks = [
        _generate_single(text, count, t, difficulty, topic=topic)
        for t, count in zip(types, counts)
        if count > 0
    ]

    type_results = await asyncio.gather(*type_tasks, return_exceptions=True)

    all_questions: List[dict] = []
    for i, result in enumerate(type_results):
        if isinstance(result, Exception):
            logger.error(f"[Type {types[i]}] Failed: {result}")
        else:
            all_questions.extend(result)

    return all_questions
