import json
import asyncio
import re
from typing import List
from groq import Groq
from core.config import GROQ_API_KEY

# Reliable Groq model — better quality and less rate-limited than 8b-instant
MODEL_NAME = "llama-3.3-70b-versatile"

client = Groq(api_key=GROQ_API_KEY)


# =========================
# Prompt Builder
# =========================
def build_prompt(context: str, num_questions: int, q_type: str, difficulty: str):
    level = {"Easy": "BASIC recall", "Medium": "COMPREHENSION", "Hard": "ANALYSIS"}.get(difficulty, "COMPREHENSION")
    # Use up to 12,000 chars — enough for any normal lecture PDF
    # Old value of 3,000 was too small (a 3K-word doc is ~18K chars)
    ctx = context[:12000]

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


# =========================
# JSON Extractor — bracket-counting approach (robust for large responses)
# =========================
def extract_json(text: str):
    # 1. Try direct parse first
    try:
        return json.loads(text.strip())
    except Exception:
        pass

    # 2. Strip markdown fences
    text = re.sub(r"```(?:json)?", "", text).strip()

    # 3. Try re-parsing the clean text
    try:
        return json.loads(text)
    except Exception:
        pass

    # 4. Find the first '[' and match closing ']' by bracket counting
    start = text.find("[")
    if start == -1:
        print("JSON EXTRACT: no '[' found in response")
        return []

    depth = 0
    end = -1
    for i in range(start, len(text)):
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end == -1:
        # Fallback: try the last ']'
        end = text.rfind("]")
        if end == -1:
            return []
        end += 1

    candidate = text[start:end]
    try:
        result = json.loads(candidate)
        if isinstance(result, list):
            return result
    except Exception as e:
        print(f"JSON EXTRACT: final parse failed — {e}")
        print(f"JSON EXTRACT: candidate[:500] = {candidate[:500]}")

    # Partial recovery: JSON was truncated mid-stream.
    # Extract every fully-formed {...} object that completed before the cutoff.
    print("JSON EXTRACT: attempting partial object recovery...")
    partial = []
    depth = 0
    obj_start = -1
    for i, ch in enumerate(candidate):
        if ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start != -1:
                obj_str = candidate[obj_start: i + 1]
                try:
                    obj = json.loads(obj_str)
                    if isinstance(obj, dict):
                        partial.append(obj)
                except Exception:
                    pass
                obj_start = -1
    if partial:
        print(f"JSON EXTRACT: partial recovery OK — {len(partial)} objects recovered")
        return partial

    return []


LABELS = ["A", "B", "C", "D", "E", "F"]


def _normalize_options(options: list) -> list:
    """
    Ensure every option starts with 'A) ', 'B) ', etc.
    The LLM sometimes returns options like:
      - Already prefixed:  ["A) True", "B) False"]
      - Un-prefixed:       ["O(n)", "O(n log n)", "O(n^2)", "O(1)"]
      - Numbered:          ["1) ...", "2) ..."]
    We detect the format and add the label prefix when missing.
    """
    if not options:
        return options

    # Check if first option already has a valid A-D letter prefix
    first = str(options[0]).strip()
    has_prefix = (
        len(first) > 1
        and first[0].upper() in LABELS
        and first[1] in (")", ".", " ", ":")
    )

    if has_prefix:
        # Already has letter prefixes — normalise format to "X) text"
        normalised = []
        for i, opt in enumerate(options):
            s = str(opt).strip()
            label = LABELS[i] if i < len(LABELS) else str(i + 1)
            # Strip any existing prefix (A), A., A:, a), a., etc.) and re-add cleanly
            text = re.sub(r"^[A-Fa-f\d][).\s:]\s*", "", s).strip()
            # Truncate oversized options (e.g. pasted code/arrays)
            if len(text) > 80:
                text = text[:77] + "..."
            normalised.append(f"{label}) {text}")
        return normalised
    else:
        # No prefix — add A) B) C) D) labels
        result = []
        for i in range(min(len(options), len(LABELS))):
            text = str(options[i]).strip()
            if len(text) > 80:
                text = text[:77] + "..."
            result.append(f"{LABELS[i]}) {text}")
        return result


def _normalize_correct(correct) -> str:
    """
    Normalise the correct field to a single uppercase letter.
    Handles: "A", "a", "A)", "A) True", "true", "True", "1", "2"
    """
    s = str(correct).strip()
    if not s:
        return "A"
    # If it's a single letter or letter followed by ), ., space — extract it
    first = s[0].upper()
    if first in LABELS:
        return first
    # If the LLM returned a number ("1", "2", ...) — convert to letter
    if s[0].isdigit():
        idx = int(s[0]) - 1
        return LABELS[idx] if 0 <= idx < len(LABELS) else "A"
    return "A"


# =========================
# Quiz Generator
# =========================
async def _generate_single(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str
) -> List[dict]:

    prompt = build_prompt(text, num_questions, q_type, difficulty)

    print(f"\n====== GENERATING {num_questions} {q_type} ({difficulty}) ======")
    print(f"Text length: {len(text)} chars")

    try:
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
            max_tokens=4096,   # llama-3.3-70b supports up to 32K output; 4K is plenty for 30 MCQs
        )

        content = response.choices[0].message.content
        print("\n========== RAW LLM RESPONSE ==========")
        print(content[:2000])
        print("=======================================\n")

        questions = extract_json(content)
        print(f"Parsed {len(questions)} questions from LLM response")

        # Validate — keep only well-formed questions, normalise option format
        valid = []
        for q in questions:
            if isinstance(q, dict) and q.get("question") and q.get("options") and q.get("correct"):
                if not q.get("type"):
                    q["type"] = q_type
                # ── Normalise options to always have A) B) C) D) prefix ────────
                q["options"] = _normalize_options(q["options"])
                # ── Normalise correct to a single uppercase letter ────────────
                q["correct"] = _normalize_correct(q["correct"])
                valid.append(q)

        if not valid:
            print("WARNING: No valid questions after validation")

        return valid

    except Exception as e:
        # Re-raise with a descriptive message so the route can return a
        # meaningful 500 detail instead of a blank one.
        error_type = type(e).__name__
        error_msg  = str(e)
        print(f"LLM ERROR ({error_type}): {error_msg}")
        import traceback; traceback.print_exc()
        # Surface the real error to the caller
        raise RuntimeError(f"Groq API error [{error_type}]: {error_msg}") from e


# =========================
# Multi-type wrapper
# =========================
async def generate_quiz_from_text(
    text: str,
    num_questions: int,
    q_type: str,
    difficulty: str
) -> List[dict]:
    """Supports comma-separated q_type like 'MCQ,TF,FIB' for mixed generation."""
    types = [t.strip().upper() for t in q_type.split(",") if t.strip()]
    if len(types) <= 1:
        return await _generate_single(text, num_questions, q_type, difficulty)

    # Distribute questions across types evenly
    base = num_questions // len(types)
    extras = num_questions % len(types)
    counts = [base + (1 if i < extras else 0) for i in range(len(types))]

    all_questions = []
    for t, count in zip(types, counts):
        if count <= 0:
            continue
        batch = await _generate_single(text, count, t, difficulty)
        all_questions.extend(batch)

    return all_questions
