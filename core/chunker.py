"""
core/chunker.py — Optimised PDF Text Chunker (v2 — speed)

"""

import re
from typing import Generator, List

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
TARGET_CHUNK_WORDS  = 2000   # ↑ was 1000 — fewer chunks → fewer API calls
MIN_CHUNK_WORDS     = 500    # ↑ was 300
MAX_CHUNK_WORDS     = 2800   # ↑ was 1500
OVERLAP_WORDS       = 150    # ↑ was 120 — more context
MAX_TOTAL_CHUNKS    = 10     # ↓ was 20 — hard cap

AVG_WORD_LEN = 5


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
    Generator that yields sentence-safe, overlapping text chunks.
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

        # Single sentence larger than max — split by words
        if s_words > max_words:
            words = sentence.split()
            for i in range(0, len(words), target_words):
                sub = " ".join(words[i:i + target_words])
                if sub.strip():
                    yield sub
            continue

        # Flush when target or hard max is reached
        if (current_word_count + s_words > max_words or
                (current_word_count + s_words > target_words and
                 current_word_count >= MIN_CHUNK_WORDS)):

            if current_sentences:
                yield " ".join(current_sentences)

                overlap_text  = _get_overlap_text(current_sentences, overlap_words)
                overlap_count = _count_words(overlap_text)
                current_sentences  = [overlap_text] if overlap_text else []
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
    Merges adjacent chunks if total exceeds MAX_TOTAL_CHUNKS (cap = 10).
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
    """Fast estimate of chunk count without full tokenization."""
    effective = target_words - OVERLAP_WORDS
    return max(1, min(MAX_TOTAL_CHUNKS, round(_count_words(text) / effective)))
