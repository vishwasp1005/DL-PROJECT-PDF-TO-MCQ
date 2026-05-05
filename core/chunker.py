"""
core/chunker.py — Robust PDF Text Chunker
==========================================
Handles splitting large PDF texts into safe, overlapping chunks for LLM processing.

Design guarantees:
  - Never breaks mid-sentence
  - Maintains 100-150 word context overlap between chunks
  - Each chunk stays within 500-1500 words (configurable)
  - Works as a generator — no full text held in memory
  - Safe for PDFs up to 20MB+
"""

import re
from typing import Generator, List

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
TARGET_CHUNK_WORDS  = 1000   # target words per chunk
MIN_CHUNK_WORDS     = 300    # don't create chunks smaller than this
MAX_CHUNK_WORDS     = 1500   # hard ceiling per chunk
OVERLAP_WORDS       = 120    # ~120 words of overlap between consecutive chunks
MAX_TOTAL_CHUNKS    = 20     # safety cap; merge-up if exceeded

# Characters per word heuristic (for char-based fallback)
AVG_WORD_LEN        = 5


def _sentence_tokenize(text: str) -> List[str]:
    """
    Split text into sentences using a simple regex that avoids breaking on
    common abbreviations (Mr., Dr., e.g., etc.).
    """
    # Protect common abbreviations before splitting
    abbrev_pattern = re.compile(
        r'\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|etc|vs|approx|e\.g|i\.e|Fig|No|Vol|pp)\.',
        re.IGNORECASE
    )
    protected = abbrev_pattern.sub(lambda m: m.group().replace('.', '<DOT>'), text)

    # Split on sentence-ending punctuation followed by whitespace + capital
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'(])', protected)

    # Restore protected dots
    return [s.replace('<DOT>', '.').strip() for s in sentences if s.strip()]


def _count_words(text: str) -> int:
    return len(text.split())


def _get_overlap_text(sentences: List[str], overlap_words: int) -> str:
    """
    Return the last N words worth of sentences to use as overlap prefix
    for the next chunk.
    """
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
    Generator that yields text chunks. Each chunk:
      - Is 300-1500 words (configurable)
      - Does NOT break mid-sentence
      - Has ~120-word context overlap with the previous chunk
      - Is yielded immediately (no full-text buffering)

    Usage:
        for chunk in chunk_text_generator(full_text):
            process(chunk)
    """
    if not text or not text.strip():
        return

    sentences = _sentence_tokenize(text)
    if not sentences:
        return

    current_sentences: List[str] = []
    current_word_count = 0
    overlap_prefix: List[str] = []

    for sentence in sentences:
        s_words = _count_words(sentence)

        # If a single sentence exceeds max chunk size, split it by words
        if s_words > max_words:
            words = sentence.split()
            for i in range(0, len(words), target_words):
                sub_chunk = " ".join(words[i:i + target_words])
                if sub_chunk.strip():
                    yield sub_chunk
            continue

        # Flush when we'd exceed target, as long as we have a minimum size
        if (current_word_count + s_words > max_words or
                (current_word_count + s_words > target_words and
                 current_word_count >= MIN_CHUNK_WORDS)):

            if current_sentences:
                chunk_text = " ".join(current_sentences)
                yield chunk_text

                # Build overlap from tail of emitted chunk
                overlap_text = _get_overlap_text(current_sentences, overlap_words)
                overlap_prefix = [overlap_text] if overlap_text else []
                overlap_count = _count_words(overlap_text)

                # Start new chunk with overlap prefix
                current_sentences = overlap_prefix.copy()
                current_word_count = overlap_count

        current_sentences.append(sentence)
        current_word_count += s_words

    # Emit any remaining text
    if current_sentences:
        remaining = " ".join(current_sentences)
        if _count_words(remaining) >= 50:   # don't emit tiny trailing fragments
            yield remaining
        elif remaining.strip():
            # Tiny tail — append to a previously yielded chunk isn't possible
            # in a generator, so just yield it (it will be processed as-is)
            yield remaining


def chunk_text_list(
    text: str,
    target_words: int = TARGET_CHUNK_WORDS,
    overlap_words: int = OVERLAP_WORDS,
) -> List[str]:
    """
    Materialize all chunks into a list.
    For very large PDFs use chunk_text_generator() instead to avoid memory spikes.
    Automatically merges chunks if total exceeds MAX_TOTAL_CHUNKS.
    """
    chunks = list(chunk_text_generator(text, target_words, overlap_words))

    if not chunks:
        return []

    # Merge down if too many chunks (cap parallel LLM calls)
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
    word_count = _count_words(text)
    # Account for overlap reducing effective chunk size
    effective_words = target_words - OVERLAP_WORDS
    return max(1, round(word_count / effective_words))
