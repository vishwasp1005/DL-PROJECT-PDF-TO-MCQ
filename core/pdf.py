"""
core/pdf.py — Streaming PDF Text Extractor
===========================================
Replaces the original single-pass, full-memory loader with a page-by-page
streaming extractor that:
  - Never loads the full PDF text into memory at once
  - Uses pypdf (already in requirements) with a BytesIO wrapper
  - Yields text page-by-page (generator pattern)
  - Falls back cleanly on corrupt / image-only pages
  - Provides a convenience helper that returns full text (for callers
    that still need the whole string, e.g. /analyze endpoint)
"""

import io
import logging
from typing import Generator, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Page-level streaming extractor (generator)
# ─────────────────────────────────────────────────────────────────────────────

def extract_pages_generator(file_bytes: bytes) -> Generator[str, None, None]:
    """
    Yield extracted text one page at a time.
    Corrupt or image-only pages are skipped with a warning — they never
    raise an exception that kills the whole job.

    Usage:
        for page_text in extract_pages_generator(file_bytes):
            accumulate_or_process(page_text)
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError(
            "pypdf is required. Install it with: pip install pypdf"
        )

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Cannot open PDF: {exc}") from exc

    num_pages = len(reader.pages)
    logger.info(f"[PDF] Opening PDF: {num_pages} pages")

    for page_num, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
            page_text = page_text.strip()
            if page_text:
                yield page_text
            else:
                logger.debug(f"[PDF] Page {page_num}/{num_pages}: no extractable text (image/blank)")
        except Exception as exc:
            logger.warning(f"[PDF] Page {page_num}/{num_pages} extraction failed, skipping: {exc}")
            continue


# ─────────────────────────────────────────────────────────────────────────────
# Full-text extraction (for small PDFs / analyze endpoint)
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes, max_chars: Optional[int] = None) -> str:
    """
    Extract all text from a PDF file (given as raw bytes).

    Args:
        file_bytes:  Raw PDF bytes (from await file.read())
        max_chars:   Optional cap on total characters extracted.
                     Useful for the /analyze endpoint to avoid OOM on huge files.

    Returns:
        Extracted text string. Empty string if PDF has no extractable text.

    Raises:
        ValueError:  If file_bytes is not a valid PDF.
    """
    parts = []
    total_chars = 0

    for page_text in extract_pages_generator(file_bytes):
        parts.append(page_text)
        total_chars += len(page_text)

        if max_chars and total_chars >= max_chars:
            logger.info(f"[PDF] Reached max_chars={max_chars}, stopping extraction early")
            break

    return "\n".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# PDF metadata (page count, size check)
# ─────────────────────────────────────────────────────────────────────────────

def get_pdf_metadata(file_bytes: bytes) -> dict:
    """
    Return basic PDF metadata without extracting all text.
    Fast — suitable for validation before processing.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        return {
            "page_count": len(reader.pages),
            "size_bytes": len(file_bytes),
            "size_mb": round(len(file_bytes) / (1024 * 1024), 2),
        }
    except Exception as exc:
        raise ValueError(f"Invalid PDF: {exc}") from exc


# ─────────────────────────────────────────────────────────────────────────────
# Backward-compat shim (old callers used extract_text_from_pdf(file_obj))
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_pdf_legacy(file) -> str:
    """
    Backward-compatible wrapper that accepts a file-like object instead of bytes.
    Prefer extract_text_from_pdf(bytes) in new code.
    """
    file_bytes = file.read() if hasattr(file, "read") else file
    return extract_text_from_pdf(file_bytes)
