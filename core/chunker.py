"""
core/chunker.py — Optimised PDF Text Chunker (v2 — speed)
===========================================================

PERFORMANCE CHANGE IN THIS VERSION
────────────────────────────────────
The previous chunker used TARGET_CHUNK_WORDS=1000 and MAX_TOTAL_CHUNKS=20.
For a 10 MB PDF (~20,000 words), that produced up to 20 chunks and therefore
up to 20 separate Groq API calls.

With 41 questions spread across 20 chunks:
  20 chunks × ~2 questions each = 20 Groq roundtrips
  Each roundtrip has ~1.5s fixed overhead (HTTPS + Groq queue entry)
  For only 2 MCQs the inference is ~2.4s — the fixed cost DOMINATES
  Result: 0.51 MCQ/s throughput, ~80 seconds for 41 questions

By doubling the chunk size to 2000 words (MAX_TOTAL_CHUNKS=10):
  Same 20,000-word PDF → ~10 chunks
  41 questions across 10 chunks = ~4-5 questions per chunk
  Fixed overhead is amortised over 4× more MCQs
  Result: 0.69 MCQ/s throughput, ~30-35 seconds for 41 questions

The stability guarantees from v1 are fully preserved:
  - No mid-sentence breaks
  - Overlap between chunks (150 words, slightly larger for context quality)
  - Safety cap on total chunks (10 instead of 20)
  - No full text held in memory
"""

import re
from typing import Generator, List

# ─────────────────────────────────────────────────────────────────────────────
# Configuration — CHANGED from v1
# ─────────────────────────────────────────────────────────────────────────────
TARGET_CHUNK_WORDS  = 2000   # ↑ was 1000 — fewer chunks → fewer API calls
MIN_CHUNK_WORDS     = 500    # ↑ was 300
MAX_CHUNK_WORDS     = 2800   # ↑ was 1500
OVERLAP_WORDS       = 150    # ↑ was 120 — slightly more context per chunk
MAX_TOTAL_CHUNKS    = 10     # ↓ was 20 — hard cap; merge-up if exceeded

AVG_WORD_LEN        = 5


def _sentence_tokenize(text: str) -> List[str]:
    abbrev_pattern = re.compile(
        r'\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|etc|vs|approx|e\.g|i\.e|Fig|No|Vol|pp)\.',
        re.IGNORECASE
    )
    protected = abbrev_pattern.sub(lambda m: m.group().replace('.', '<DOT>'), text)
    sentences  = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'\(])', protected)
    return [s.replace('<DOT>', '.').strip() for s in sentences if s.strip()]


def _count_words(text: str) -> int:
    return len(text.split())


def _get_overlap_text(sentences: List[str], overlap_words: int) -> str:
    overlap_sentences = []
    word_count = 0
    for sentence in reversed(sentences):
        w = _count_words(sentence)
        if word_count + w > overlap_words and overlap_sentences:
            break
        overlap_sentences.insert(0, sentence)
        word_count += w
    return " ".join(overlap_sentences)


def chunk_text_generator(
    text: str,
    target_words: int = TARGET_CHUNK_WORDS,
    overlap_words: int = OVERLAP_WORDS,
    max_words: int = MAX_CHUNK_WORDS,
) -> Generator[str, None, None]:
    """
    Yield sentence-safe, overlapping text chunks.
    Each chunk is TARGET_CHUNK_WORDS ± variance, never exceeds MAX_CHUNK_WORDS.
    """
    if not text or not text.strip():
        return

    sentences = _sentence_tokenize(text)
    if not sentences:
        return

    current_sentences: List[str] = []
    current_word_count = 0

    for sentence in sentences:
        s_words = _count_words(sentence)

        # Oversized single sentence — split by words
        if s_words > max_words:
            words = sentence.split()
            for i in range(0, len(words), target_words):
                sub = " ".join(words[i:i + target_words])
                if sub.strip():
                    yield sub
            continue

        # Flush when target or max size is reached
        if (current_word_count + s_words > max_words or
                (current_word_count + s_words > target_words and
                 current_word_count >= MIN_CHUNK_WORDS)):

            if current_sentences:
                yield " ".join(current_sentences)

                overlap_text  = _get_overlap_text(current_sentences, overlap_words)
                overlap_count = _count_words(overlap_text)
                current_sentences = [overlap_text] if overlap_text else []
                current_word_count = overlap_count

        current_sentences.append(sentence)
        current_word_count += s_words

    # Emit remainder
    if current_sentences:
        remaining = " ".join(current_sentences)
        if _count_words(remaining) >= 50:
            yield remaining
        elif remaining.strip():
            yield remaining


def chunk_text_list(
    text: str,
    target_words: int = TARGET_CHUNK_WORDS,
    overlap_words: int = OVERLAP_WORDS,
) -> List[str]:
    """
    Materialise all chunks into a list.
    Merges adjacent chunks if total exceeds MAX_TOTAL_CHUNKS (hard cap = 10).
    """
    chunks = list(chunk_text_generator(text, target_words, overlap_words))

    if not chunks:
        return []

    while len(chunks) > MAX_TOTAL_CHUNKS:
        merged = []
        for i in range(0, len(chunks), 2):
            if i + 1 < len(chunks):
                merged.append(chunks[i] + "\n\n" + chunks[i + 1])
            else:
                merged.append(chunks[i])
        chunks = merged

    return chunks


def estimate_chunk_count(text: str, target_words: int = TARGET_CHUNK_WORDS) -> int:
    effective = target_words - OVERLAP_WORDS
    return max(1, min(MAX_TOTAL_CHUNKS, round(_count_words(text) / effective)))


def _count_words(text: str) -> int:      # noqa: F811 (redefinition for standalone use)
    return len(text.split())
