"""
core/generator.py — Deadlock-Free Parallel MCQ Generator (v4)
==============================================================

BUGS FIXED (all caused the 88% freeze):

BUG 1 — asyncio.to_thread() has no per-call timeout
  asyncio.to_thread() parks the Groq SDK call on a thread-pool thread.
  If Groq stalls (TCP open, no bytes), the thread hangs forever.
  FIX: wrap every call with asyncio.wait_for(timeout=90s).

BUG 2 — Sequential batch loop blocks on any single hung call
  _run_in_batches() ran batch-0 → await gather → then batch-1 → ...
  One hung call in batch-1 meant batch-2 NEVER started → stuck at 88%.
  FIX: submit ALL chunk tasks to one asyncio.gather(). Semaphore controls
  concurrency. A hung call holds one slot; all others keep progressing.

BUG 3 — Multi-type concurrency explosion (MCQ+TF+FIB = 12 concurrent calls)
  Each type had its own MAX_PARALLEL=4 inner loop, so 3 types × 4 = 12
  simultaneous Groq calls → guaranteed 429s and TCP stalls.
  FIX: one global asyncio.Semaphore(4) shared across ALL types and chunks.

BUG 4 — Wrong retry backoff: 2^0=1s, 2^1=2s (both inside Groq's 60s window)
  FIX: BACKOFF_SCHEDULE = [5, 30, 65]. Semaphore released BEFORE sleep.
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
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
MODEL_NAME         = "llama-3.3-70b-versatile"
MAX_PARALLEL       = 4            # max TOTAL concurrent Groq calls (all types combined)
MAX_RETRIES        = 3
LLM_CALL_TIMEOUT_S = 90           # FIX BUG 1: hard per-call timeout
BACKOFF_SCHEDULE   = [5, 30, 65]  # FIX BUG 4: retry waits in seconds
MAX_CHUNK_CHARS    = 6000

client = Groq(api_key=GROQ_API_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# Global semaphore — FIX BUG 2 + BUG 3
# Shared across ALL chunk tasks and ALL question types.
# Lazily initialised so it binds to the running event loop correctly.
# ─────────────────────────────────────────────────────────────────────────────
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
    level = {
        "Easy":   "BASIC recall",
        "Medium": "COMPREHENSION",
        "Hard":   "ANALYSIS",
    }.get(difficulty, "COMPREHENSION")
    ctx        = context[:MAX_CHUNK_CHARS]
    topic_line = f"IMPORTANT: Focus exclusively on the topic '{topic}' only.\n\n" if topic else ""

    if q_type == "TF":
        return (
            f"{topic_line}Generate {num_questions} True/False questions at {level} level.\n"
            "Return ONLY a valid JSON array. No markdown, no explanation.\n"
            'Each object: question, options (["A) True","B) False"]), correct ("A" or "B"), topic, difficulty, type.\n\n'
            f"Context:\n{ctx}"
        )
    if q_type == "FIB":
        return (
            f"{topic_line}Generate {num_questions} fill-in-the-blank MCQ questions at {level} level. Use ___ for the blank.\n"
            "Return ONLY a valid JSON array. No markdown, no explanation.\n"
            'Each object: question (with ___), options (4 A-D, A is correct), correct ("A"), topic, difficulty, type.\n\n'
            f"Context:\n{ctx}"
        )
    # Default MCQ
    return (
        f"{topic_line}Generate {num_questions} MCQ questions at {level} level.\n"
        "Return ONLY a valid JSON array. No markdown. Each option max 60 chars. Prefix every option: A), B), C), D).\n\n"
        f"Context:\n{ctx}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction (robust bracket-counting + partial recovery)
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
        if text[i] == "[":
            depth += 1
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

    # Partial object recovery for truncated responses
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
                    obj = json.loads(candidate[obj_start:i + 1])
                    if isinstance(obj, dict):
                        partial.append(obj)
                except Exception:
                    pass
                obj_start = -1
    return partial


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation helpers
# ─────────────────────────────────────────────────────────────────────────────
LABELS = ["A", "B", "C", "D", "E", "F"]


def _normalize_options(options: list) -> list:
    if not options:
        return options
    first      = str(options[0]).strip()
    has_prefix = len(first) > 1 and first[0].upper() in LABELS and first[1] in (")", ".", " ", ":")
    result     = []
    for i, opt in enumerate(options[:len(LABELS)]):
        s    = str(opt).strip()
        text = re.sub(r"^[A-Fa-f\d][).\s:]\s*", "", s).strip() if has_prefix else s
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
# Rate-limit detection
# ─────────────────────────────────────────────────────────────────────────────

def _is_rate_limit(exc: Exception) -> bool:
    if "RateLimit" in type(exc).__name__:
        return True
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    return status == 429 or "429" in str(exc) or "rate limit" in str(exc).lower()


def _retry_after(exc: Exception) -> Optional[int]:
    headers = getattr(getattr(exc, "response", None), "headers", {})
    val     = (headers or {}).get("retry-after")
    try:
        return int(val) if val else None
    except (ValueError, TypeError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Core: single chunk → LLM call
# Fixes: BUG 1 (per-call timeout), BUG 2+3 (semaphore), BUG 4 (backoff)
# ─────────────────────────────────────────────────────────────────────────────

async def _call_llm(
    chunk_text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    chunk_idx: int,
    topic: Optional[str] = None,
) -> List[dict]:
    """
    Send one chunk to Groq. Guarantees:
      - Never hangs > LLM_CALL_TIMEOUT_S (90s) per attempt            [BUG 1]
      - Semaphore acquired only during the call, released before sleep [BUG 2+3]
      - Correct backoff schedule [5, 30, 65]s                          [BUG 4]
      - Always returns [] on exhaustion — NEVER raises
    """
    prompt    = build_prompt(chunk_text, num_questions, q_type, difficulty, topic)
    semaphore = _get_semaphore()

    for attempt in range(MAX_RETRIES + 1):
        last_exc: Optional[Exception] = None
        is_rl = False

        # ── Semaphore held ONLY during the Groq call, not during sleep ────────
        async with semaphore:
            try:
                logger.info(
                    f"[Chunk {chunk_idx}][{q_type}] attempt {attempt + 1}/{MAX_RETRIES + 1} "
                    f"— {num_questions} q"
                )

                # FIX BUG 1: asyncio.wait_for gives the call a hard deadline.
                # On TimeoutError the `async with semaphore` block exits,
                # releasing the slot immediately so other chunks can proceed.
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.chat.completions.create,
                        model=MODEL_NAME,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "You are an expert quiz generator. "
                                    "Always respond with ONLY a valid JSON array starting with '[' and ending with ']'. "
                                    "No markdown. No explanation. No text outside the array. "
                                    "Keep each answer option under 60 characters."
                                ),
                            },
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
                        if not q.get("type"):
                            q["type"] = q_type
                        q["options"] = _normalize_options(q["options"])
                        q["correct"] = _normalize_correct(q["correct"])
                        valid.append(q)

                logger.info(f"[Chunk {chunk_idx}][{q_type}] ✓ {len(valid)} questions")
                return valid

            except asyncio.TimeoutError:
                logger.warning(
                    f"[Chunk {chunk_idx}][{q_type}] ⏱ timed out after {LLM_CALL_TIMEOUT_S}s "
                    f"(attempt {attempt + 1}) — slot released"
                )
                last_exc = asyncio.TimeoutError()
                is_rl    = False

            except Exception as e:
                logger.warning(
                    f"[Chunk {chunk_idx}][{q_type}] ✗ {type(e).__name__} "
                    f"(attempt {attempt + 1}): {e}"
                )
                last_exc = e
                is_rl    = _is_rate_limit(e)

        # ── Semaphore released — sleep OUTSIDE so other chunks can run ─────────
        if attempt >= MAX_RETRIES:
            logger.error(f"[Chunk {chunk_idx}][{q_type}] ✗✗ SKIPPED after {MAX_RETRIES + 1} attempts")
            return []

        wait = (
            (_retry_after(last_exc) or BACKOFF_SCHEDULE[min(attempt, len(BACKOFF_SCHEDULE) - 1)])
            if is_rl
            else BACKOFF_SCHEDULE[min(attempt, len(BACKOFF_SCHEDULE) - 1)]
        )
        logger.warning(f"[Chunk {chunk_idx}][{q_type}] retrying in {wait}s…")
        await asyncio.sleep(wait)

    return []


# ─────────────────────────────────────────────────────────────────────────────
# Fully parallel gather — FIX BUG 2 (replaces sequential batch loop)
# ─────────────────────────────────────────────────────────────────────────────

async def _run_all_chunks(
    chunks: List[str],
    q_per_chunk: List[int],
    q_type: str,
    difficulty: str,
    topic: Optional[str],
) -> List[dict]:
    """
    Submit ALL chunk tasks simultaneously. The semaphore inside _call_llm()
    limits concurrency to MAX_PARALLEL. Unlike the old sequential batch loop,
    a hung call in 'batch 1' no longer blocks 'batch 2' from starting —
    other tasks simply wait for a semaphore slot and run as soon as one frees.

    asyncio.gather(return_exceptions=True) ALWAYS resolves. Combined with
    the 90s per-call timeout, the pipeline is guaranteed to complete.
    """
    tasks = [
        _call_llm(chunk, q_count, q_type, difficulty, i, topic)
        for i, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]

    logger.info(f"[Pipeline][{q_type}] {len(tasks)} tasks → semaphore cap={MAX_PARALLEL}")
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_questions: List[dict] = []
    completed = failed = skipped = 0

    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            logger.error(f"[Chunk {i}][{q_type}] escaped gather: {result}")
            failed += 1
        elif isinstance(result, list):
            if result:
                all_questions.extend(result)
                completed += 1
            else:
                skipped += 1

    logger.info(
        f"[Pipeline][{q_type}] done — "
        f"completed={completed} skipped={skipped} failed={failed} "
        f"questions={len(all_questions)}"
    )
    return all_questions


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_single(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    # Chunking is CPU-bound — keep off the event loop
    chunks = await asyncio.to_thread(chunk_text_list, text)

    logger.info(
        f"\n====== START {q_type}: {num_questions} q | "
        f"{len(chunks)} chunks | topic={topic or 'all'} ======"
    )

    if not chunks:
        return []
    if len(chunks) == 1:
        return await _call_llm(chunks[0], num_questions, q_type, difficulty, 0, topic)

    q_per_chunk   = distribute_questions(num_questions, len(chunks))
    all_questions = await _run_all_chunks(chunks, q_per_chunk, q_type, difficulty, topic)

    seen:    set        = set()
    deduped: List[dict] = []
    for q in all_questions:
        key = q["question"].strip().lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)

    logger.info(f"====== END {q_type}: {len(deduped)} unique questions ======\n")
    return deduped


async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    """
    Public entry point. Comma-separated q_type ('MCQ,TF,FIB') supported.
    All types share _llm_semaphore → total concurrent calls always ≤ MAX_PARALLEL.
    """
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]
    if len(types) <= 1:
        return await _generate_single(text, num_questions, q_type.upper(), difficulty, topic)

    base   = num_questions // len(types)
    extras = num_questions % len(types)
    counts = [base + (1 if i < extras else 0) for i in range(len(types))]

    type_tasks = [
        _generate_single(text, count, t, difficulty, topic)
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
