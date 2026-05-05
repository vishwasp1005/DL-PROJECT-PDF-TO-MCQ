"""
core/generator.py — Scalable Parallel Chunked MCQ Generator
=============================================================
Architecture (v2 — large-PDF safe):

  1. Text is fed in as a full string (already extracted page-by-page in quiz.py)
  2. core/chunker.py splits it into 500-1500 word sentence-safe chunks with overlap
  3. Chunks are processed in PARALLEL BATCHES of MAX_PARALLEL workers
     (prevents Groq rate-limit hammering on large PDFs)
  4. Each chunk → LLM call with retry + exponential backoff
  5. Results are merged, deduplicated, and normalised
  6. If a chunk fails after retries → it is SKIPPED and logged (never crashes)

Token safety: Each chunk is capped at MAX_CHUNK_CHARS characters before
sending to Groq, which keeps every request well within the model's context window.
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
MODEL_NAME    = "llama-3.3-70b-versatile"
MAX_PARALLEL  = 4          # concurrent Groq calls (stay under rate limits)
MAX_RETRIES   = 2          # retry each failed chunk this many times
RETRY_BASE_S  = 2          # exponential backoff base (seconds)
MAX_CHUNK_CHARS = 6000     # hard cap per chunk sent to LLM (~1500 tokens)

client = Groq(api_key=GROQ_API_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# Chunking (delegated to core/chunker.py)
# ─────────────────────────────────────────────────────────────────────────────

def split_into_chunks(text: str) -> List[str]:
    """Public interface used by quiz.py for chunk_count reporting."""
    return chunk_text_list(text)


def distribute_questions(total: int, num_chunks: int) -> List[int]:
    """Distribute `total` questions as evenly as possible across `num_chunks`."""
    base  = total // num_chunks
    extra = total % num_chunks
    return [base + (1 if i < extra else 0) for i in range(num_chunks)]


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def build_prompt(context: str, num_questions: int, q_type: str, difficulty: str) -> str:
    level = {"Easy": "BASIC recall", "Medium": "COMPREHENSION", "Hard": "ANALYSIS"}.get(difficulty, "COMPREHENSION")
    # Enforce per-chunk char cap so we never exceed LLM token limits
    ctx   = context[:MAX_CHUNK_CHARS]

    if q_type == "TF":
        return f"""Generate {num_questions} True/False questions at {level} level.

Return ONLY a valid JSON array. No markdown, no explanation.
Each object MUST have: question (a factual statement), options (always ["A) True", "B) False"]), correct ("A" for True or "B" for False), topic, difficulty, type.

[
  {{
    "question": "...",
    "options": ["A) True", "B) False"],
    "correct": "A",
    "topic": "topic name",
    "difficulty": "{difficulty}",
    "type": "TF"
  }}
]

Context:
{ctx}
"""
    if q_type == "FIB":
        return f"""Generate {num_questions} fill-in-the-blank MCQ questions at {level} level. Use ___ for the blank.

Return ONLY a valid JSON array. No markdown, no explanation.
Each object MUST have: question (sentence with ___), options (4 choices A-D, A is always correct), correct ("A"), topic, difficulty, type.

[
  {{
    "question": "The ___ is responsible for producing ATP in a cell.",
    "options": ["A) mitochondria", "B) nucleus", "C) ribosome", "D) vacuole"],
    "correct": "A",
    "topic": "topic name",
    "difficulty": "{difficulty}",
    "type": "FIB"
  }}
]

Context:
{ctx}
"""
    # Default MCQ
    return f"""Generate {num_questions} MCQ questions at {level} level.

CRITICAL RULES:
- Return ONLY a valid JSON array. No markdown, no explanation.
- Each option MUST be a short label (max 60 characters). DO NOT paste raw arrays, matrices, or code output as options.
- If a question involves code output, describe the output briefly (e.g. 'A 1D array of 10 zeros') instead of printing the full value.
- Every option string must start with the letter prefix: A), B), C), D)

[
  {{
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A",
    "topic": "topic name",
    "difficulty": "{difficulty}",
    "type": "MCQ"
  }}
]

Context:
{ctx}
"""


# ─────────────────────────────────────────────────────────────────────────────
# JSON extraction (robust bracket-counting)
# ─────────────────────────────────────────────────────────────────────────────

def extract_json(text: str) -> List[dict]:
    # 1. Direct parse
    try:
        return json.loads(text.strip())
    except Exception:
        pass

    # 2. Strip markdown fences
    text = re.sub(r"```(?:json)?", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    # 3. Bracket-counting extraction
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

    # 4. Partial object recovery (truncated responses)
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
# Single chunk → LLM call (with retry + exponential backoff)
# ─────────────────────────────────────────────────────────────────────────────

async def _call_llm(
    chunk_text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
    chunk_idx: int,
    retries: int = MAX_RETRIES,
) -> List[dict]:
    """
    Send one chunk to Groq. Retries up to `retries` times with exponential backoff.
    Returns empty list (never raises) after exhausting retries — the chunk is skipped.
    """
    prompt = build_prompt(chunk_text, num_questions, q_type, difficulty)

    for attempt in range(retries + 1):
        try:
            logger.info(f"[Chunk {chunk_idx}] Generating {num_questions} {q_type} questions (attempt {attempt + 1})")
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
                            "Keep each answer option under 60 characters — describe outputs briefly, never paste raw arrays or code."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=4096,
            )

            content   = response.choices[0].message.content
            questions = extract_json(content)

            # Validate + normalise
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
            if attempt < retries:
                wait = RETRY_BASE_S ** attempt
                logger.warning(f"[Chunk {chunk_idx}] Error (attempt {attempt + 1}): {e}. Retrying in {wait}s…")
                await asyncio.sleep(wait)
            else:
                logger.error(f"[Chunk {chunk_idx}] Failed after {retries + 1} attempts — skipping: {e}")
                return []   # skip, never crash

    return []


# ─────────────────────────────────────────────────────────────────────────────
# Batched parallel execution (respects MAX_PARALLEL to avoid rate limits)
# ─────────────────────────────────────────────────────────────────────────────

async def _run_in_batches(tasks_args: list, q_type: str, difficulty: str) -> List[dict]:
    """
    Execute LLM tasks in batches of MAX_PARALLEL.
    Each task_arg is (chunk_text, num_questions, chunk_idx).
    Returns merged list of all questions from all batches.
    """
    all_questions: List[dict] = []

    for batch_start in range(0, len(tasks_args), MAX_PARALLEL):
        batch = tasks_args[batch_start: batch_start + MAX_PARALLEL]
        logger.info(f"[Batch] Processing chunks {batch_start}–{batch_start + len(batch) - 1} in parallel")

        tasks = [
            _call_llm(chunk_text, num_q, q_type, difficulty, chunk_idx)
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
) -> List[dict]:
    """
    Split text into sentence-safe chunks, generate MCQs in parallel batches,
    then merge + deduplicate results.
    """
    chunks = chunk_text_list(text)
    logger.info(f"\n====== PARALLEL GENERATION: {num_questions} {q_type} ({difficulty}) | {len(chunks)} chunk(s) ======")

    if not chunks:
        logger.warning("No chunks produced — text may be empty or too short")
        return []

    if len(chunks) == 1:
        # Small PDF — single call, no batching overhead
        return await _call_llm(chunks[0], num_questions, q_type, difficulty, chunk_idx=0)

    # Distribute questions proportionally across chunks
    q_per_chunk = distribute_questions(num_questions, len(chunks))

    # Build task args list (filter out zero-question chunks)
    tasks_args = [
        (chunk, q_count, i)
        for i, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]

    all_questions = await _run_in_batches(tasks_args, q_type, difficulty)

    # Deduplicate by normalised question text
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
# Multi-type wrapper (MCQ + TF + FIB mixed)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str,
) -> List[dict]:
    """
    Public entry point. Supports comma-separated q_type like 'MCQ,TF,FIB'.
    Each type is generated via parallel chunked pipeline.
    """
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]
    if len(types) <= 1:
        return await _generate_single(text, num_questions, q_type.upper(), difficulty)

    # Distribute questions across question types
    base   = num_questions // len(types)
    extras = num_questions % len(types)
    counts = [base + (1 if i < extras else 0) for i in range(len(types))]

    # Run each type's chunked generation concurrently
    type_tasks = [
        _generate_single(text, count, t, difficulty)
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
