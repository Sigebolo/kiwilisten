"""
KiwiListen FastAPI web app.

Routes:
  GET  /                               — article list (index.html)
  GET  /listen/{slug}                  — sentence player (listen.html)
  GET  /api/article/{slug}             — article metadata + sentences JSON
  GET  /api/article/{slug}/audio       — stream full MP3
  GET  /api/articles                   — list all articles (JSON)
"""
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
_root = str(BASE_DIR.resolve().parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from fastapi import FastAPI, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
import jinja2

import json
import random
from pipeline.db import get_article, get_sentences, get_all_articles, save_quiz_score, get_quiz_stats, get_quiz_scores
from pipeline.quiz_rules import make_quiz_options, DIFFICULTY_TIERS

DATA_DIR  = BASE_DIR.parent / "data"
AUDIO_DIR = DATA_DIR / "articles"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="KiwiListen — NZ English Listening Coach")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Direct jinja2 (bypass starlette templating to avoid cache/loader edge cases)
_jinja = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(BASE_DIR / "templates")),
    autoescape=jinja2.select_autoescape(),
)


def _html(name: str, **ctx) -> HTMLResponse:
    return HTMLResponse(_jinja.get_template(name).render(**ctx))


# ── Helpers ───────────────────────────────────────────────────────────────────
def article_with_sentences(slug: str) -> dict:
    article = get_article(slug)
    if not article:
        raise HTTPException(404, f"Article '{slug}' not found")
    if article["status"] != "aligned":
        raise HTTPException(409, f"Article '{slug}' not aligned (status={article['status']})")
    sentences = get_sentences(article["id"])
    return {"article": article, "sentences": sentences}


# ── Pages ─────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    articles = get_all_articles()
    # Attach quiz stats to aligned articles
    for a in articles:
        if a["status"] == "aligned":
            art = get_article(a["slug"])
            if art:
                a["quiz_stats"] = get_quiz_stats(art["id"])
        else:
            a["quiz_stats"] = {"attempts": 0, "avg_pct": 0, "best_pct": 0}
    return _html("index.html", request=request, articles=articles)


@app.get("/listen/{slug}", response_class=HTMLResponse)
async def listen(slug: str, request: Request):
    data = article_with_sentences(slug)
    return _html(
        "listen.html",
        request=request,
        slug=slug,
        article=data["article"],
        sentences=data["sentences"],
    )


# ── Quiz ──────────────────────────────────────────────────────────────────────
def _generate_quiz_data(sentences: list[dict], n_questions: int = 10, difficulty: str = "medium") -> list[dict]:
    """Pick n sentences and generate quiz questions for them."""
    eligible = [
        i for i, s in enumerate(sentences)
        if len(s["text"].split()) >= 5  # skip very short sentences
    ]
    if not eligible:
        eligible = list(range(len(sentences)))

    n = min(n_questions, len(eligible))
    chosen = random.sample(eligible, n)
    chosen.sort()

    quiz_data = []
    for idx in chosen:
        sent = sentences[idx]
        tokens = sent["text"].split()
        q = make_quiz_options(tokens, difficulty=difficulty)
        if q:
            q["hint_index"] = idx  # sentence index in the array
            quiz_data.append(q)

    return quiz_data


@app.get("/quiz/{slug}", response_class=HTMLResponse)
async def quiz(slug: str, request: Request, difficulty: str = "medium", sentences: int = 10, speed: float = 1.0):
    data = article_with_sentences(slug)
    sent_list = data["sentences"]
    n_q = max(3, min(sentences, len(sent_list)))  # clamp 3..N
    quiz_data = _generate_quiz_data(sent_list, n_questions=n_q, difficulty=difficulty)

    return _html(
        "quiz.html",
        request=request,
        slug=slug,
        article=data["article"],
        sentences_json=json.dumps(sent_list),
        quiz_data_json=json.dumps(quiz_data),
        total=len(quiz_data),
        difficulty=difficulty,
        speed=speed,
    )


# ── JSON API ──────────────────────────────────────────────────────────────────
@app.get("/api/articles")
async def api_articles():
    return get_all_articles()


@app.get("/api/article/{slug}")
async def api_article(slug: str):
    data = article_with_sentences(slug)
    return {
        "slug":      data["article"]["slug"],
        "title":     data["article"]["title"],
        "status":    data["article"]["status"],
        "sentences": data["sentences"],
    }


@app.get("/api/article/{slug}/audio")
async def api_audio(slug: str):
    article = get_article(slug)
    if not article:
        raise HTTPException(404, f"Article '{slug}' not found")
    audio_path = Path(article["audio_path"])
    if not audio_path.exists():
        raise HTTPException(404, f"Audio not found for '{slug}'")

    def iterfile():
        with open(audio_path, "rb") as f:
            while chunk := f.read(65_536):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":  "bytes",
            "Content-Length": str(audio_path.stat().st_size),
        },
    )


# ── Quiz Score API ──────────────────────────────────────────────────────────
@app.post("/api/quiz-score")
async def api_save_score(
    slug: str = Form(...),
    score: int = Form(...),
    total: int = Form(...),
    difficulty: str = Form("medium"),
    speed: float = Form(1.0),
):
    article = get_article(slug)
    if not article:
        raise HTTPException(404, f"Article '{slug}' not found")
    row_id = save_quiz_score(
        article_id=article["id"],
        score=score,
        total=total,
        difficulty=difficulty,
        speed=speed,
    )
    return {"ok": True, "id": row_id}


@app.get("/api/quiz-stats/{slug}")
async def api_quiz_stats(slug: str):
    article = get_article(slug)
    if not article:
        raise HTTPException(404, f"Article '{slug}' not found")
    stats = get_quiz_stats(article["id"])
    scores = get_quiz_scores(article["id"], limit=5)
    return {**stats, "recent": scores}


# ── Dev server launcher ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web.app:app", host="0.0.0.0", port=8001, reload=True)