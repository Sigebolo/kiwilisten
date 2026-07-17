"""SQLite schema and CRUD helpers for KiwiListen."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

DATABASE_PATH = Path(__file__).parent.parent / "data" / "kiwilisten.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

# Singleton connection for the module
_conn: sqlite3.Connection | None = None


def get_connection() -> sqlite3.Connection:
    """Get a shared WAL-mode connection, creating the schema if needed."""
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _init_schema(_conn)
    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS articles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        slug        TEXT UNIQUE NOT NULL,
        title       TEXT NOT NULL,
        url         TEXT NOT NULL,
        mp3_url     TEXT NOT NULL,
        audio_path  TEXT NOT NULL,
        transcript  TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'fetched'
                    CHECK(status IN ('fetched','downloaded','aligned','error')),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sentences (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        sentence_num INTEGER NOT NULL,
        text         TEXT NOT NULL,
        start_sec    REAL,
        end_sec      REAL,
        UNIQUE(article_id, sentence_num)
    );

    CREATE TABLE IF NOT EXISTS quiz_scores (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        score        INTEGER NOT NULL,
        total        INTEGER NOT NULL,
        difficulty   TEXT NOT NULL DEFAULT 'medium',
        speed        REAL NOT NULL DEFAULT 1.0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
    CREATE INDEX IF NOT EXISTS idx_sentences_article ON sentences(article_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_scores_article ON quiz_scores(article_id);
    """)


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ── Article CRUD ──────────────────────────────────────────────────────────────

def upsert_article(
    slug: str,
    title: str,
    url: str,
    mp3_url: str,
    audio_path: str,
    transcript: str,
) -> int:
    """Insert or update an article, returning its rowid."""
    with get_db() as db:
        db.execute(
            """
            INSERT INTO articles (slug, title, url, mp3_url, audio_path, transcript, status)
            VALUES (:slug, :title, :url, :mp3_url, :audio_path, :transcript, 'fetched')
            ON CONFLICT(slug) DO UPDATE SET
                title       = excluded.title,
                url         = excluded.url,
                mp3_url     = excluded.mp3_url,
                audio_path  = excluded.audio_path,
                transcript  = excluded.transcript
            """,
            dict(slug=slug, title=title, url=url, mp3_url=mp3_url,
                 audio_path=audio_path, transcript=transcript),
        )
        row = db.execute(
            "SELECT id FROM articles WHERE slug = ?", (slug,)
        ).fetchone()
        return row[0]


def update_article_status(slug: str, status: str) -> None:
    with get_db() as db:
        db.execute(
            "UPDATE articles SET status = ? WHERE slug = ?",
            (status, slug),
        )


def get_article(slug: str) -> dict | None:
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM articles WHERE slug = ?", (slug,)
        ).fetchone()
        if row is None:
            return None
        cols = [c[0] for c in db.execute("SELECT * FROM articles LIMIT 0").description]
        return dict(zip(cols, row))


def get_all_articles() -> list[dict]:
    with get_db() as db:
        rows = db.execute(
            "SELECT id, slug, title, url, mp3_url, audio_path, status, created_at "
            "FROM articles ORDER BY created_at DESC"
        ).fetchall()
        cols = [c[0] for c in db.execute(
            "SELECT id, slug, title, url, mp3_url, audio_path, status, created_at "
            "FROM articles LIMIT 0"
        ).description]
        return [dict(zip(cols, r)) for r in rows]


# ── Sentence CRUD ─────────────────────────────────────────────────────────────

def replace_sentences(article_id: int, sentences: list[dict]) -> None:
    """Replace all sentences for an article (used after alignment)."""
    with get_db() as db:
        db.execute(
            "DELETE FROM sentences WHERE article_id = ?", (article_id,)
        )
        db.executemany(
            """
            INSERT INTO sentences (article_id, sentence_num, text, start_sec, end_sec)
            VALUES (:article_id, :sentence_num, :text, :start_sec, :end_sec)
            """,
            [{**s, "article_id": article_id} for s in sentences],
        )


def get_sentences(article_id: int) -> list[dict]:
    with get_db() as db:
        rows = db.execute(
            "SELECT sentence_num, text, start_sec, end_sec "
            "FROM sentences WHERE article_id = ? ORDER BY sentence_num",
            (article_id,)
        ).fetchall()
        cols = ["sentence_num", "text", "start_sec", "end_sec"]
        return [dict(zip(cols, r)) for r in rows]


# ── Quiz Score CRUD ─────────────────────────────────────────────────────────

def save_quiz_score(
    article_id: int,
    score: int,
    total: int,
    difficulty: str = "medium",
    speed: float = 1.0,
) -> int:
    """Save a quiz result, returning the row id."""
    with get_db() as db:
        cur = db.execute(
            """
            INSERT INTO quiz_scores (article_id, score, total, difficulty, speed)
            VALUES (?, ?, ?, ?, ?)
            """,
            (article_id, score, total, difficulty, speed),
        )
        return cur.lastrowid


def get_quiz_scores(article_id: int, limit: int = 10) -> list[dict]:
    """Get recent quiz scores for an article."""
    with get_db() as db:
        rows = db.execute(
            "SELECT score, total, difficulty, speed, created_at "
            "FROM quiz_scores WHERE article_id = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (article_id, limit),
        ).fetchall()
        cols = ["score", "total", "difficulty", "speed", "created_at"]
        return [dict(zip(cols, r)) for r in rows]


def get_quiz_stats(article_id: int) -> dict:
    """Get aggregate quiz stats for an article."""
    with get_db() as db:
        row = db.execute(
            "SELECT COUNT(*) as attempts, "
            "AVG(CAST(score AS FLOAT) / total * 100) as avg_pct, "
            "MAX(CAST(score AS FLOAT) / total * 100) as best_pct "
            "FROM quiz_scores WHERE article_id = ?",
            (article_id,),
        ).fetchone()
        return {
            "attempts": row[0] or 0,
            "avg_pct": round(row[1] or 0, 1),
            "best_pct": round(row[2] or 0, 1),
        }