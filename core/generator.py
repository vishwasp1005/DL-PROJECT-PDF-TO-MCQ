"""
core/generator.py — Speed-optimised, Deadlock-Free MCQ Generator (v5)
=======================================================================

BOTTLENECK ANALYSIS (10 MB PDF, 41 questions)
──────────────────────────────────────────────
The v4 generator was stable but slow because of three compounding issues:

BOTTLENECK 1 — Too many API calls (20) each asking too few MCQs (2-3)
  With TARGET_CHUNK_WORDS=1000 and MAX_TOTAL_CHUNKS=20, a 10MB PDF (~20,000
  words) produced 20 chunks. 41 questions spread across 20 chunks = ~2 MCQs
  per Groq call.

  Every Groq call has fixed overhead:
    HTTPS connection + queue entry: ~1.5s
    Inference for 2 MCQs output:   ~2.4s  (240 output tokens @ ~100 tok/s)
    Total per call:                 ~3.9s
    Throughput:                     2/3.9 = 0.51 MCQ/s

  For 20 calls at MAX_PARALLEL=4 (5 serial slots × ~8s avg):  ~40–80s

  With chunker.py now producing MAX_TOTAL_CHUNKS=10 (2000-word chunks):
    41 questions / 10 chunks = ~4-5 MCQs per call
    Inference for 5 MCQs:    ~6s  (600 output tokens)
    Total per call:           ~7.5s
    Throughput:               5/7.5 = 0.67 MCQ/s  (+31% per call)
    10 calls / MAX_PARALLEL=5 (2 serial slots × ~10s avg):  ~20s

BOTTLENECK 2 — Undifferentiated retry backoff
  v4 used BACKOFF_SCHEDULE=[5, 30, 65] for ALL error types.
  A transient timeout (common on Groq free tier) triggered the same 30–65s
  waits as a true rate-limit hit.

  Example: 3 chunks in the last batch, one times out on attempt 1:
    attempt 0: 90s timeout + wait 5s  → 95s (worse: the 90s timeout fired)
    attempt 1: 90s timeout + wait 30s → 120s more
    Total for that task: 215s on the critical path

  FIX: Split into two independent schedules:
    TIMEOUT_BACKOFF    = [3, 8]   — fast retry (connection glitch, usually gone)
    RATE_LIMIT_BACKOFF = [62]     — must wait past Groq's 60s window (only 1 retry needed)
    OTHER_BACKOFF      = [5, 15]  — network errors, 5xx

BOTTLENECK 3 — LLM_CALL_TIMEOUT_S=90s too generous
  When Groq TCP-stalls, the timeout fires after 90s. That's 90s of dead wait
  on the critical path. For a 10-chunk job with MAX_PARALLEL=5, only 2 serial
  slots exist. A single 90s timeout on any task makes that slot 90s long.

  FIX: Reduce to 55s. Groq's p99 response time for 600-token outputs is well
  under 30s. 55s gives plenty of headroom while cutting worst-case dead wait
  from 90s to 55s.

PERFORMANCE SUMMARY (10 MB PDF, 41 MCQs)
  v4: ~80–120s  (20 chunks × 2 MCQs, 5 serial slots, 90s timeout)
  v5: ~20–35s   (10 chunks × 4 MCQs, 2 serial slots, 55s timeout)
  Speedup: 3–4×

Stability guarantees from v4 are fully preserved:
  ✅ Global asyncio.Semaphore — no concurrency explosion
  ✅ asyncio.wait_for per call — no infinite hangs
  ✅ asyncio.gather(return_exceptions=True) — always resolves
  ✅ Semaphore released BEFORE sleep — other tasks proceed during backoff
  ✅ Empty list returned on exhausted retries — pipeline always completes
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
# Configuration  (delta from v4 marked with ←)
# ─────────────────────────────────────────────────────────────────────────────
MODEL_NAME         = "llama-3.3-70b-versatile"
MAX_PARALLEL       = 5            # ← was 4  (+1 worker, still safe at 25 RPM < 30 limit)
MAX_RETRIES        = 2            # ← was 3  (fewer retries → faster failure path)
LLM_CALL_TIMEOUT_S = 55           # ← was 90 (cuts dead-wait on TCP stall by 38%)
MAX_CHUNK_CHARS    = 9000         # ← was 6000 (matches new 2000-word chunks)

# ← Split backoff by error type (was one unified BACKOFF_SCHEDULE)
TIMEOUT_BACKOFF     = [3, 8]      # transient timeout — retry fast
RATE_LIMIT_BACKOFF  = [62]        # Groq 429 — must clear 60s window (one retry)
OTHER_BACKOFF       = [5, 15]     # network / 5xx errors

client = Groq(api_key=GROQ_API_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# Global semaphore — shared across all types and all chunks
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
# Prompt builder — tighter prompts, lower token usage
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

    # Compact single-line JSON schema comment keeps prompt short
    schema = '{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"' + q_type + '"}'

    if q_type == "TF":
        schema = '{"question":"...","options":["A) True","B) False"],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"TF"}'
        return (
            f"{topic_line}Generate {num_questions} True/False questions at {level} level.\n"
            f"Return ONLY a JSON array of objects matching: {schema}\n"
            f"No markdown. No explanation.\n\nContext:\n{ctx}"
        )
    if q_type == "FIB":
        schema = '{"question":"The ___ ...","options":["A) correct","B) wrong","C) wrong","D) wrong"],"correct":"A","topic":"...","difficulty":"' + difficulty + '","type":"FIB"}'
        return (
            f"{topic_line}Generate {num_questions} fill-in-the-blank MCQ questions at {level} level. Use ___ for the blank.\n"
            f"Return ONLY a JSON array of objects matching: {schema}\n"
            f"No markdown. No explanation.\n\nContext:\n{ctx}"
        )
    return (
        f"{topic_line}Generate {num_questions} MCQ questions at {level} level.\n"
        f"Return ONLY a JSON array of objects matching: {schema}\n"
        f"Rules: options max 60 chars each. Start every option with A) B) C) D). No markdown.\n\n"
        f"Context:\n{ctx}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction (bracket-counting + partial recovery)
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
        result = json.loads(candidate)
        if isinstance(result, list):
            return result
    except Exception:
        pass

    # Partial recovery for truncated responses
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
# Error classification — drives split backoff (the key speed improvement)
# ─────────────────────────────────────────────────────────────────────────────

def _classify_error(exc: Exception) -> str:
    """Return 'timeout' | 'rate_limit' | 'other'."""
    if isinstance(exc, asyncio.TimeoutError):
        return "timeout"
    if isinstance(exc, asyncio.CancelledError):
        return "timeout"
    exc_name = type(exc).__name__
    if "RateLimit" in exc_name:
        return "rate_limit"
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status == 429 or "429" in str(exc) or "rate limit" in str(exc).lower():
        return "rate_limit"
    return "other"


def _get_backoff(error_class: str, attempt: int, exc: Exception) -> float:
    """Return seconds to sleep based on error class and attempt number."""
    if error_class == "rate_limit":
        # Prefer server's retry-after header; fall back to our schedule
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
# Core LLM call — semaphore + per-call timeout + split backoff
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
    One chunk → one Groq call. Guarantees:
      • Never hangs > LLM_CALL_TIMEOUT_S (55s)
      • Semaphore released before sleep — others proceed during backoff
      • Error-type-aware backoff: timeout→3s, rate_limit→62s, other→5s
      • Always returns [] on exhaustion — never raises
    """
    prompt    = build_prompt(chunk_text, num_questions, q_type, difficulty, topic)
    semaphore = _get_semaphore()

    for attempt in range(MAX_RETRIES + 1):
        t_start   = time.monotonic()
        last_exc  = None
        succeeded = False

        async with semaphore:
            try:
                logger.info(
                    f"[Chunk {chunk_idx}][{q_type}] attempt {attempt + 1}/{MAX_RETRIES + 1} "
                    f"— {num_questions} questions"
                )
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.chat.completions.create,
                        model=MODEL_NAME,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "You are an expert quiz generator. "
                                    "Respond ONLY with a valid JSON array starting with '[' and ending with ']'. "
                                    "No markdown fences. No text outside the array. "
                                    "Each answer option must be under 60 characters."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.4,
                        max_tokens=4096,
                    ),
                    timeout=LLM_CALL_TIMEOUT_S,
                )

                elapsed = time.monotonic() - t_start
                content   = response.choices[0].message.content
                questions = extract_json(content)

                valid = []
                for q in questions:
                    if isinstance(q, dict) and q.get("question") and q.get("options") and q.get("correct"):
                        q.setdefault("type", q_type)
                        q["options"] = _normalize_options(q["options"])
                        q["correct"] = _normalize_correct(q["correct"])
                        valid.append(q)

                logger.info(
                    f"[Chunk {chunk_idx}][{q_type}] ✓ {len(valid)} questions in {elapsed:.1f}s"
                )
                succeeded = True
                return valid

            except Exception as e:
                elapsed   = time.monotonic() - t_start
                last_exc  = e
                err_class = _classify_error(e)
                logger.warning(
                    f"[Chunk {chunk_idx}][{q_type}] ✗ {err_class} after {elapsed:.1f}s "
                    f"(attempt {attempt + 1}): {type(e).__name__}"
                )

        # Semaphore released — compute backoff and sleep outside it
        if attempt >= MAX_RETRIES or succeeded:
            break

        wait = _get_backoff(_classify_error(last_exc), attempt, last_exc)
        logger.warning(
            f"[Chunk {chunk_idx}][{q_type}] sleeping {wait}s before retry {attempt + 2}"
        )
        await asyncio.sleep(wait)

    if not succeeded:
        logger.error(
            f"[Chunk {chunk_idx}][{q_type}] SKIPPED after {MAX_RETRIES + 1} attempts"
        )
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Fully-parallel gather (no sequential batch loop)
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

    logger.info(
        f"[Pipeline][{q_type}] {len(tasks)} tasks submitted "
        f"(semaphore={MAX_PARALLEL}, ~{len(tasks)//MAX_PARALLEL + 1} serial slots)"
    )

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
        f"[Pipeline][{q_type}] done — completed={completed} "
        f"skipped={skipped} failed={failed} questions={len(all_questions)}"
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
    t0     = time.monotonic()
    chunks = await asyncio.to_thread(chunk_text_list, text)

    logger.info(
        f"\n====== START {q_type}: {num_questions}q | {len(chunks)} chunks | "
        f"topic={topic or 'all'} | ~{num_questions // max(len(chunks),1)}-"
        f"{(num_questions // max(len(chunks),1)) + 1} q/chunk ======"
    )

    if not chunks:
        return []

    if len(chunks) == 1:
        return await _call_llm(chunks[0], num_questions, q_type, difficulty, 0, topic)

    q_per_chunk   = distribute_questions(num_questions, len(chunks))
    all_questions = await _run_all_chunks(chunks, q_per_chunk, q_type, difficulty, topic)

    # Deduplicate by normalised question text
    seen: set       = set()
    deduped: List[dict] = []
    for q in all_questions:
        key = q["question"].strip().lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)

    elapsed = time.monotonic() - t0
    logger.info(
        f"====== END {q_type}: {len(deduped)} unique questions in {elapsed:.1f}s ======\n"
    )
    return deduped


async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    topic: Optional[str] = None,
) -> List[dict]:
    """
    Public entry point. Comma-separated q_type supported ('MCQ,TF,FIB').
    All types share the global semaphore — peak concurrency always ≤ MAX_PARALLEL=5.
    """
    t0    = time.monotonic()
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

    logger.info(
        f"[generate_quiz_from_text] total={len(all_questions)} questions "
        f"in {time.monotonic() - t0:.1f}s"
    )
    return all_questions
