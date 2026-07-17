"""
ESL News NZ scraper for KiwiListen.

Fetches the article list from the weekly-news category page, then for each article:
  - extracts title, date, MP3 URL, transcript text
  - downloads the MP3 to data/articles/{slug}/audio.mp3
  - saves transcript to   data/articles/{slug}/transcript.txt
  - upserts the record into SQLite

Usage:
    python -m pipeline.esl_scraper           # fetch first page only (dev)
    python -m pipeline.esl_scraper --all    # fetch all pages
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("esl_scraper")

# ── Constants ─────────────────────────────────────────────────────────────────
BASE_URL      = "https://eslnews.org.nz"
CATEGORY_URL  = f"{BASE_URL}/category/weekly-news/"
PER_PAGE      = 10          # articles per category page
REQUEST_DELAY = 1.5         # seconds between HTTP requests (polite)

DATA_DIR      = Path(__file__).parent.parent / "data"
AUDIO_DIR     = DATA_DIR / "articles"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# ── HTTP session ──────────────────────────────────────────────────────────────
_session: requests.Session | None = None


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (compatible; KiwiListen/1.0; "
                "+https://github.com/your-repo)"
            )
        })
    return _session


def _get(url: str, timeout: int = 20) -> requests.Response:
    """GET with polite delay."""
    time.sleep(REQUEST_DELAY)
    resp = get_session().get(url, timeout=timeout)
    resp.raise_for_status()
    return resp


# ── Helpers ────────────────────────────────────────────────────────────────────
def slug_from_url(url: str) -> str:
    """Derive a URL-safe slug from an ESL article URL.

    Handles both /?p=123 style and /year/month/slug/ style.
    """
    # /?p=123
    m = re.search(r"[?&]p=(\d+)", url)
    if m:
        return f"esl-{m.group(1)}"

    # /2026/07/article-slug/  →  article-slug
    segments = [s for s in url.split("/") if s]
    if segments and segments[-1]:
        last = segments[-1]
        # strip trailing slash piece if empty
        return re.sub(r"[^a-z0-9-]", "-", last.lower()).strip("-")

    # Fallback: hash the full URL
    import hashlib
    return hashlib.md5(url.encode()).hexdigest()[:12]


def _clean_text(text: str) -> str:
    """Collapse excess whitespace."""
    return re.sub(r"\s+", " ", text).strip()


# ── Page parsers ──────────────────────────────────────────────────────────────
def parse_article_list_page(html: str) -> list[str]:
    """Return article URLs from a category page."""
    soup = BeautifulSoup(html, "html.parser")
    links: list[str] = []

    # Article links appear in various container types: li, h2, h3, p, div, etc.
    # Collect ALL article links on the page, then dedupe.
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if (
            "eslnews.org.nz/?p=" in href
            and "page_id" not in href
            and "#respond" not in href
            and href not in seen
        ):
            seen.add(href)
            links.append(href)

    return links


def fetch_article_list_urls(max_pages: int | None = 1) -> list[str]:
    """Return article URLs from the category page(s).

    Args:
        max_pages: number of pages to crawl. None = all pages.
    """
    import urllib.parse

    urls: list[str] = []
    seen_urls: set[str] = set()
    page = 1

    while True:
        if page == 1:
            page_url = CATEGORY_URL
        else:
            page_url = f"{CATEGORY_URL}?paged={page}/"

        log.info("Scraping category page %s: %s", page, page_url)
        try:
            resp = _get(page_url)
        except Exception as exc:
            log.error("  ✗ Failed to fetch category page %s: %s", page_url, exc)
            break

        found = parse_article_list_page(resp.text)
        if not found:
            log.info("  No article links found on page %s — done.", page)
            break

        new_count = sum(1 for u in found if u not in seen_urls)
        log.info("  Found %s article links (%s new)", len(found), new_count)
        for u in found:
            if u not in seen_urls:
                urls.append(u)
                seen_urls.add(u)

        if max_pages is not None and page >= max_pages:
            break

        # Detect if there's a next page
        soup = BeautifulSoup(resp.text, "html.parser")
        next_link = soup.select_one("a.next, a.page-numbers.next, a[rel='next']")
        if not next_link and page == 1 and len(found) < PER_PAGE:
            # Only page of results
            break
        page += 1

    return urls


def parse_article_page(html: str) -> dict:
    """Extract title, date, MP3 URL, transcript text from an article page.

    Returns dict with keys: title, date, mp3_url, transcript
    Raises ValueError if required fields are missing.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Title
    title_el = soup.select_one("h1.entry-title")
    if not title_el:
        raise ValueError("Could not find h1.entry-title")
    title = _clean_text(title_el.get_text())

    # Date
    date_el = soup.select_one("time.entry-date")
    date = date_el.get("datetime", "") if date_el else ""

    # MP3 URL
    audio_el = soup.select_one("figure.wp-block-audio audio")
    if not audio_el:
        raise ValueError("Could not find figure.wp-block-audio audio")
    mp3_url = audio_el.get("src", "")
    if not mp3_url:
        raise ValueError("audio element has no src attribute")

    # Transcript: between <strong>News story</strong> and <strong>Answers</strong>
    # Note: strong may be inside a <p>, not a standalone element
    transcript_parts: list[str] = []
    found_story = False
    found_answers = False

    content = soup.select_one(".entry-content")
    if not content:
        raise ValueError("Could not find .entry-content")

    for el in content.find_all(["p", "strong"], recursive=False):
        # Handle direct <strong> elements (e.g. <strong>News story</strong>)
        if el.name == "strong":
            text = _clean_text(el.get_text())
            if "News story" in text or el.get_text(strip=True) == "Text":
                found_story = True
                continue
            if "Answers" in text or "Answer" in text or el.get_text(strip=True) == "Answers":
                found_answers = True
                break
        # Handle <p> elements (may contain nested <strong> or be plain text like <p>Text</p>)
        if el.name == "p":
            strong = el.find("strong", recursive=False)
            if strong:
                strong_text = _clean_text(strong.get_text())
                if "News story" in strong_text:
                    found_story = True
                    continue
                if "Answers" in strong_text or "Answer" in strong_text:
                    found_answers = True
                    break
            # Plain <p>Text</p> or <p>News story</p> without <strong>
            p_text = _clean_text(el.get_text())
            p_stripped = el.get_text(strip=True)
            if p_stripped in ("Text", "News story"):
                found_story = True
                continue
            if p_stripped in ("Answers", "Answer"):
                found_answers = True
                break
            if found_story and not found_answers:
                if p_text:
                    transcript_parts.append(p_text)

    if not transcript_parts:
        raise ValueError("No transcript found between 'News story'/'Text' and 'Answers'")

    transcript = "\n\n".join(transcript_parts)

    return dict(title=title, date=date, mp3_url=mp3_url, transcript=transcript)


def download_mp3(mp3_url: str, dest_path: Path) -> Path:
    """Download MP3 to dest_path, replacing existing file."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    log.info("  Downloading MP3: %s", mp3_url)
    resp = get_session().get(mp3_url, timeout=60, stream=True)
    resp.raise_for_status()

    # Write in chunks; don't keep entire file in memory
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

    log.info("  Saved MP3 → %s  (%.1f KB)", dest_path.name, dest_path.stat().st_size / 1024)
    return dest_path


# ── Per-article pipeline ───────────────────────────────────────────────────────
def fetch_article(article_url: str) -> dict | None:
    """Fetch one article: parse, download MP3, save files, upsert DB.

    Returns the article dict with slug and audio_path on success,
    or None on failure (logged).
    """
    slug = slug_from_url(article_url)
    log.info("Fetching article: %s  [%s]", article_url, slug)

    try:
        resp = _get(article_url)
        data = parse_article_page(resp.text)
    except Exception as exc:
        log.error("  ✗ Parse error for %s: %s", article_url, exc)
        return None

    # ── save audio ──────────────────────────────────────────────────────────
    audio_path = AUDIO_DIR / slug / "audio.mp3"
    try:
        download_mp3(data["mp3_url"], audio_path)
    except Exception as exc:
        log.error("  ✗ MP3 download failed for %s: %s", article_url, exc)
        return None

    # ── save transcript ──────────────────────────────────────────────────────
    transcript_path = AUDIO_DIR / slug / "transcript.txt"
    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(data["transcript"], encoding="utf-8")
    log.info("  Saved transcript → %s", transcript_path.name)

    # ── upsert SQLite ────────────────────────────────────────────────────────
    try:
        from .db import upsert_article, update_article_status
        article_id = upsert_article(
            slug        = slug,
            title       = data["title"],
            url         = article_url,
            mp3_url     = data["mp3_url"],
            audio_path  = str(audio_path),
            transcript  = data["transcript"],
        )
        # mark as downloaded only after both files are on disk
        update_article_status(slug, "downloaded")
        log.info("  ✓ DB upserted (id=%s, status=downloaded)", article_id)
    except Exception as exc:
        log.error("  ✗ DB error for %s: %s", slug, exc)
        return None

    return {
        "article_id": article_id,
        "slug": slug,
        "title": data["title"],
        "audio_path": str(audio_path),
        "mp3_url": data["mp3_url"],
        "transcript": data["transcript"],
    }


# ── CLI ───────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="ESL News NZ scraper")
    parser.add_argument(
        "--all", action="store_true",
        help="Fetch all pages (default: first page only for speed)",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Stop after N articles (for dev testing)",
    )
    args = parser.parse_args()

    max_pages: int | None = None if args.all else 1
    article_urls = fetch_article_list_urls(max_pages=max_pages)

    if not article_urls:
        log.warning("No article URLs found — aborting.")
        sys.exit(1)

    if args.limit:
        article_urls = article_urls[: args.limit]

    log.info("Will fetch %s article(s)", len(article_urls))

    success = 0
    failed  = 0
    for url in article_urls:
        result = fetch_article(url)
        if result:
            success += 1
        else:
            failed += 1

    log.info(
        "Done. success=%s  failed=%s  total=%s",
        success, failed, len(article_urls),
    )


if __name__ == "__main__":
    main()