"""
core/generator.py — Parallel Chunked MCQ Generator
====================================================
Architecture:
  1. Split PDF text into ~1000-token (≈4000-char) chunks
  2. Assign MCQ count proportionally per chunk
  3. Fire all chunk → LLM calls concurrently via asyncio.gather
  4. Merge + deduplicate results

This reduces latency for large PDFs from O(N) sequential → O(1) parallel.
Rate-limit headroom: each chunk sends ≤12K chars, well under Groq's context window.
"""

import json
import asyncio
import re
from typing import List
from groq import Groq
from core.config import GROQ_API_KEY

# llama-3.3-70b is more reliable for structured JSON output
MODEL_NAME = "llama-3.3-70b-versatile"

client = Groq(api_key=GROQ_API_KEY)

# ─────────────────────────────────────────────────────────────────────────────
# Chunking
# ─────────────────────────────────────────────────────────────────────────────
CHARS_PER_TOKEN     = 4          # rough heuristic (English text)
TARGET_CHUNK_TOKENS = 1000       # tokens per chunk
TARGET_CHUNK_CHARS  = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN   # 4000 chars
MAX_CHUNKS          = 12         # never spawn more than 12 parallel calls


def split_into_chunks(text: str, chunk_chars: int = TARGET_CHUNK_CHARS) -> List[str]:
    """
    Split text into overlapping chunks by paragraph boundaries.
    Overlap of one paragraph at the end of each chunk gives the LLM context
    continuity so questions don't get cut off mid-topic.
    """
    # Split on blank lines (paragraphs)
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for para in paragraphs:
        if current_len + len(para) > chunk_chars and current:
            chunks.append("\n\n".join(current))
            # Overlap: keep the last paragraph of the previous chunk
            current = [current[-1], para]
            current_len = len(current[-2]) + len(para)
        else:
            current.append(para)
            current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))

    # Guard against excessively many chunks (rate-limit safety)
    if len(chunks) > MAX_CHUNKS:
        # Merge adjacent chunks until we're within limit
        while len(chunks) > MAX_CHUNKS:
            merged = []
            for i in range(0, len(chunks), 2):
                if i + 1 < len(chunks):
                    merged.append(chunks[i] + "\n\n" + chunks[i + 1])
                else:
                    merged.append(chunks[i])
            chunks = merged

    return chunks


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
    ctx   = context[:12000]   # cap per chunk (already chunked, but safety guard)

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
    retries: int = 2,
) -> List[dict]:
    """Call Groq for a single chunk. Retries up to `retries` times on failure."""
    prompt = build_prompt(chunk_text, num_questions, q_type, difficulty)

    for attempt in range(retries + 1):
        try:
            print(f"[Chunk {chunk_idx}] Generating {num_questions} {q_type} questions (attempt {attempt + 1})")
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

            print(f"[Chunk {chunk_idx}] Got {len(valid)} valid questions")
            return valid

        except Exception as e:
            if attempt < retries:
                wait = 2 ** attempt   # 1s → 2s → 4s
                print(f"[Chunk {chunk_idx}] Error (attempt {attempt + 1}): {e}. Retrying in {wait}s…")
                await asyncio.sleep(wait)
            else:
                print(f"[Chunk {chunk_idx}] Failed after {retries + 1} attempts: {e}")
                raise RuntimeError(f"Groq API error on chunk {chunk_idx}: {e}") from e

    return []


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
    Split `text` into chunks, generate MCQs in parallel, then merge results.
    Falls back to a single call if the text fits in one chunk.
    """
    chunks = split_into_chunks(text)
    print(f"\n====== PARALLEL GENERATION: {num_questions} {q_type} ({difficulty}) | {len(chunks)} chunk(s) ======")

    if len(chunks) == 1:
        # Small PDF — no need for parallelism
        return await _call_llm(chunks[0], num_questions, q_type, difficulty, chunk_idx=0)

    # Distribute questions across chunks proportionally
    q_per_chunk = distribute_questions(num_questions, len(chunks))

    # Fire all chunk requests concurrently
    tasks = [
        _call_llm(chunk, q_count, q_type, difficulty, chunk_idx=i)
        for i, (chunk, q_count) in enumerate(zip(chunks, q_per_chunk))
        if q_count > 0
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Merge + skip failed chunks (log them)
    all_questions: List[dict] = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"[Chunk {i}] Skipped due to error: {result}")
        else:
            all_questions.extend(result)

    # Deduplicate by question text (in case overlapping chunks produce same Q)
    seen: set = set()
    deduped: List[dict] = []
    for q in all_questions:
        key = q["question"].strip().lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)

    print(f"====== DONE: {len(deduped)} unique questions from {len(chunks)} chunks ======\n")
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
    Supports comma-separated q_type like 'MCQ,TF,FIB' for mixed generation.
    Each type is generated in parallel across chunks for maximum speed.
    """
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]
    if len(types) <= 1:
        return await _generate_single(text, num_questions, q_type.upper(), difficulty)

    # Distribute questions across types evenly
    base    = num_questions // len(types)
    extras  = num_questions % len(types)
    counts  = [base + (1 if i < extras else 0) for i in range(len(types))]

    # Run each type's generation concurrently (on top of per-chunk parallelism)
    type_tasks = [
        _generate_single(text, count, t, difficulty)
        for t, count in zip(types, counts)
        if count > 0
    ]

    type_results = await asyncio.gather(*type_tasks, return_exceptions=True)

    all_questions: List[dict] = []
    for i, result in enumerate(type_results):
        if isinstance(result, Exception):
            print(f"[Type {types[i]}] Failed: {result}")
        else:
            all_questions.extend(result)

    return all_questions
