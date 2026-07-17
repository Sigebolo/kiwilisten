"""
Forced-alignment pipeline for KiwiListen.

Takes a downloaded article (MP3 + transcript), runs faster-whisper with
word_timestamps=True, then maps whisper word timings onto the human-authored
sentence boundaries from the transcript.

Output is written to:
  - data/alignments/{slug}.json  (raw whisper word timestamps, cached)
  - SQLite sentences table        (sentence_num, text, start_sec, end_sec)
"""
from __future__ import annotations

import difflib
import json
import logging
import math
import re
import sys
from pathlib import Path

import faster_whisper

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aligner")

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR       = Path(__file__).parent.parent / "data"
AUDIO_DIR      = DATA_DIR / "articles"
ALIGNMENTS_DIR = DATA_DIR / "alignments"
ALIGNMENTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Word-timestamp extraction ──────────────────────────────────────────────────
def transcribe_with_word_timestamps(
    audio_path: str,
    model_size: str = "tiny",
) -> list[dict]:
    """Run faster-whisper tiny on audio_path and return a flat list of word dicts.

    Each dict:  {"word": str, "start": float, "end": float}
    All values in seconds.
    """
    log.info("  Loading faster-whisper (%s)…", model_size)
    model = faster_whisper.WhisperModel(model_size, device="cpu", compute_type="int8")

    log.info("  Transcribing with word_timestamps=True…")
    segments, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        language="en",
        vad_filter=True,
    )

    words: list[dict] = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                words.append({
                    "word": w.word.strip(),
                    "start": float(w.start),
                    "end":   float(w.end),
                })
        else:
            # Fallback: use segment-level timing (no word boundaries)
            words.append({
                "word": seg.text.strip(),
                "start": float(seg.start),
                "end":   float(seg.end),
            })

    log.info("  Whisper produced %s word entries", len(words))
    return words


# ── Sentence splitting ────────────────────────────────────────────────────────
def split_into_sentences(transcript: str) -> list[str]:
    """Split transcript into sentences using the same boundary logic as the design doc.

    Each <p> in the ESL article is one paragraph.  We join paragraphs with a
    blank line (already in the file) and split on sentence-ending punctuation.
    """
    # Split on paragraph boundaries first
    paragraphs = transcript.split("\n\n")
    sentences: list[str] = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # Split on . ! or ? followed by whitespace (but not decimal numbers, etc.)
        parts = re.split(r"(?<=[.!?])\s+", para)
        sentences.extend([p.strip() for p in parts if p.strip()])

    # Remove any leading sentence-number prefixes like "1." from the ESL text
    cleaned = []
    for s in sentences:
        s = re.sub(r"^\d+\.\s*", "", s).strip()
        if s:
            cleaned.append(s)

    return cleaned


# ── Timestamp mapping (global alignment) ───────────────────────────────────────


def _tokenize(text: str) -> list[str]:
    """Extract lowercase alphabetic tokens, preserving word order."""
    return re.findall(r"\b[a-zA-Z']+\b", text.lower())


def _build_sentence_word_ranges(sentences: list[str]) -> list[tuple[int, int]]:
    """Return (start_token_idx, end_token_idx) for each sentence in the
    concatenated flat token list.  end_token_idx is exclusive."""
    ranges: list[tuple[int, int]] = []
    offset = 0
    for s in sentences:
        tokens = _tokenize(s)
        n = len(tokens)
        ranges.append((offset, offset + n))
        offset += n
    # Attach flat token list for reuse
    return ranges


def map_words_to_sentences(
    word_ts: list[dict],
    sentences: list[str],
    audio_duration: float | None = None,
) -> list[dict]:
    """Map whisper word timestamps onto human transcript sentences via global
    sequence alignment.

    Uses difflib.SequenceMatcher.get_matching_blocks() to find the longest
    contiguous matching subsequences between the full whisper word stream
    and the full transcript word stream, then projects those blocks back
    onto the sentence boundaries.

    Returns a list of dicts:
      {"sentence_num": 1, "text": "...", "start_sec": float, "end_sec": float}
    """
    # ── Build flat token lists ──────────────────────────────────────────────────
    wh_tokens: list[str]       = []
    wh_token_orig_idx: list[int] = []   # maps wh_tokens[i] → original word_ts index
    for idx, w in enumerate(word_ts):
        tokens = _tokenize(w["word"])
        for t in tokens:
            wh_tokens.append(t)
            wh_token_orig_idx.append(idx)

    s_ranges = _build_sentence_word_ranges(sentences)
    s_tokens: list[str] = []
    for s in sentences:
        s_tokens.extend(_tokenize(s))

    # ── Global alignment ────────────────────────────────────────────────────────
    sm = difflib.SequenceMatcher(None, wh_tokens, s_tokens)
    blocks = sm.get_matching_blocks()   # [(wh_i, s_i, size), ...], last is (len_wh, len_s, 0)

    # Build a mapping: sentence token index → whisper token index
    # For each matching block, every aligned (s_pos, wh_pos) is known.
    s_to_wh: dict[int, int] = {}
    for wh_i, s_i, size in blocks:
        for k in range(size):
            s_to_wh[s_i + k] = wh_i + k

    # ── Project to sentences ────────────────────────────────────────────────────
    result: list[dict] = []
    last_wh_idx = 0   # track consumption to avoid backward jumps
    total_tokens = len(s_tokens)
    total_wh     = len(wh_tokens)

    for i, (s_start, s_end) in enumerate(s_ranges):
        if s_start == s_end:
            # Empty sentence — fallback: use previous sentence end + gap
            prev_end = result[-1]["end_sec"] if result else 0.0
            gap = (audio_duration or prev_end) / max(len(sentences) - i, 1)
            result.append({
                "sentence_num": i + 1,
                "text": sentences[i],
                "start_sec": round(prev_end + 0.01, 3),
                "end_sec":   round(prev_end + gap, 3),
            })
            continue

        # Find aligned whisper indices for this sentence's token range
        aligned_wh = [s_to_wh[pos] for pos in range(s_start, s_end) if pos in s_to_wh]

        if aligned_wh:
            wh_start = max(aligned_wh[0], last_wh_idx)
            wh_end   = aligned_wh[-1]
            # Validate: keep monotonic progression
            if wh_start > wh_end:
                wh_start = wh_end = max(last_wh_idx, aligned_wh[0])
            start_sec = word_ts[wh_token_orig_idx[wh_start]]["start"]
            end_sec   = word_ts[wh_token_orig_idx[wh_end]]["end"]
            last_wh_idx = wh_end
        else:
            # No direct alignment found — use proportional interpolation
            last_end = result[-1]["end_sec"] if result else 0.0
            # Estimate based on remaining sentence tokens vs remaining whisper tokens
            remaining_s_tokens = total_tokens - s_start
            remaining_wh_count = total_wh - last_wh_idx
            gap = (audio_duration or last_end + 30) - last_end
            if gap <= 0:
                gap = 1.0
            # Proportional slice of remaining gap
            ratio = (s_end - s_start) / max(remaining_s_tokens, 1)
            est = min(gap * ratio, gap * 0.8)
            start_sec = last_end + 0.01
            end_sec   = start_sec + max(est, 0.5)

        result.append({
            "sentence_num": i + 1,
            "text": sentences[i],
            "start_sec": round(start_sec, 3),
            "end_sec":   round(end_sec, 3),
        })

    # ── Post-processing: fix overlaps and gaps ───────────────────────────────────
    # Ensure monotonic non-overlapping timestamps
    for i in range(1, len(result)):
        prev_end = result[i - 1]["end_sec"]
        curr_start = result[i]["start_sec"]
        if curr_start < prev_end:
            # Overlap — push current start to just after previous end
            result[i]["start_sec"] = round(prev_end + 0.01, 3)
            if result[i]["start_sec"] >= result[i]["end_sec"]:
                result[i]["end_sec"] = round(result[i]["start_sec"] + 0.5, 3)

    # Clamp final sentence to audio_duration
    if audio_duration and result and result[-1]["end_sec"] > audio_duration + 2.0:
        result[-1]["end_sec"] = round(audio_duration - 0.01, 3)

    return result


# ── Alignment cache ───────────────────────────────────────────────────────────
def load_cached_alignment(slug: str) -> list[dict] | None:
    path = ALIGNMENTS_DIR / f"{slug}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def save_alignment_cache(slug: str, word_ts: list[dict]) -> None:
    path = ALIGNMENTS_DIR / f"{slug}.json"
    path.write_text(json.dumps(word_ts, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Per-article alignment ─────────────────────────────────────────────────────
def align_article(slug: str) -> list[dict] | None:
    """Run the full alignment pipeline for one article.

    Returns the sentence list (same shape as db.py replace_sentences expects),
    or None on failure.
    """
    from .db import get_article, get_sentences, replace_sentences, update_article_status

    log.info("Aligning article: %s", slug)

    article = get_article(slug)
    if not article:
        log.error("  Article %s not found in DB", slug)
        return None

    audio_path = Path(article["audio_path"])
    if not audio_path.exists():
        log.error("  Audio file not found: %s", audio_path)
        return None

    transcript = article["transcript"]
    if not transcript:
        log.error("  Empty transcript for %s", slug)
        return None

    # ── Step 1: cached word timestamps ─────────────────────────────────────
    word_ts = load_cached_alignment(slug)

    if word_ts is None:
        try:
            word_ts = transcribe_with_word_timestamps(str(audio_path))
            save_alignment_cache(slug, word_ts)
        except Exception as exc:
            log.error("  ✗ Whisper transcription failed: %s", exc)
            return None
    else:
        log.info("  Using cached word timestamps (%s words)", len(word_ts))

    # ── Step 2: split transcript into sentences ───────────────────────────────
    sentences = split_into_sentences(transcript)
    log.info("  Split into %s sentences", len(sentences))
    if not sentences:
        log.error("  Sentence splitting produced nothing for %s", slug)
        return None

    # ── Step 3: map timestamps ────────────────────────────────────────────────
    # Get audio duration for gap filling
    try:
        import wave
        with wave.open(str(audio_path), "rb") as wf:
            frames     = wf.getnframes()
            rate       = wf.getframerate()
            audio_dur  = frames / float(rate)
    except Exception:
        audio_dur = None

    sentence_data = map_words_to_sentences(word_ts, sentences, audio_dur)

    # Log a sample for debugging
    if sentence_data:
        sample = sentence_data[len(sentence_data) // 2]
        log.info(
            "  Sample sentence #%s [%.1f–%.1f s]: %s",
            sample["sentence_num"], sample["start_sec"], sample["end_sec"],
            sample["text"][:60],
        )

    # ── Step 4: write to DB ──────────────────────────────────────────────────
    try:
        replace_sentences(article["id"], sentence_data)
        update_article_status(slug, "aligned")
        log.info("  ✓ Wrote %s sentences to DB, status=aligned", len(sentence_data))
    except Exception as exc:
        log.error("  ✗ DB write failed: %s", exc)
        return None

    return sentence_data


# ── CLI ───────────────────────────────────────────────────────────────────────
def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="KiwiListen alignment pipeline")
    parser.add_argument("slug", nargs="?", help="Align one article by slug")
    parser.add_argument(
        "--all", action="store_true",
        help="Align all downloaded articles",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Stop after N articles (for testing)",
    )
    args = parser.parse_args()

    from .db import get_all_articles, update_article_status

    if args.slug:
        slugs = [args.slug]
    elif args.all:
        articles = get_all_articles()
        slugs = [
            a["slug"] for a in articles
            if a["status"] in ("downloaded", "error")
        ]
        if args.limit:
            slugs = slugs[: args.limit]
        log.info("Will align %s article(s)", len(slugs))
    else:
        log.error("Pass a slug or --all")
        sys.exit(1)

    success = 0
    failed  = 0
    for slug in slugs:
        result = align_article(slug)
        if result:
            success += 1
        else:
            failed += 1
            try:
                update_article_status(slug, "error")
            except Exception:
                pass

    log.info(
        "Done. success=%s  failed=%s  total=%s",
        success, failed, len(slugs),
    )


if __name__ == "__main__":
    main()