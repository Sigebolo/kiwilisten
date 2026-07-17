# NZ Real-Audio Listener: TingJu Adaptation

## 1. Concept

Adapt [TingJu (听句)](https://github.com/Pi3-l22/TingJu) — a FastAPI sentence-by-sentence TTS player — into a **real-audio listening practice tool** sourced from NZ news content. Replace edge-tts with real MP3 + forced alignment; keep TingJu's sentence-level independent playback structure (but swap `<audio src="per-sentence-file">` for seek-based single-MP3 playback).

## 2. Design Decisions (Post-Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio source | ESL News NZ (eslnews.org.nz) | Purpose-built for learners — slow clear NZ accent, downloadable MP3 + authoritative transcript paired on every page. 1792+ articles since 2008. |
| Playback model | **Seek-based** (single MP3, JS seek) | No ffmpeg pre-processing needed. ESL articles are 2-3min MP3s — seeking is instant. Zero disk waste, one less dependency. |
| Alignment tool | **faster-whisper** (tiny model, CPU) | User's existing sherpa-onnx models (SenseVoice/Qwen3/Zipformer) do NOT provide word-level timestamps — only final transcript text. faster-whisper with `word_timestamps=True` is the lightest tool that gives word-level timing. |
| Transcript source | **Always the human-authored ESL transcript** | Whisper output may contain ASR errors. We extract timing from whisper but discard its text — map timestamps to the authoritative transcript via fuzzy edit-distance matching. |
| Scraper method | HTML parsing (CSS selectors) | ESL News NZ is a standard WordPress site. The WP REST API is available but adds nothing over direct HTML parsing for our use case. |
| Storage | SQLite | No server needed, portable, single-file. TingJu already uses temp files but SQLite is more robust for managing alignment state. |
| Translation | **None in v1** | TingJu's Chinese translation feature removed. This tool is pure listening — no translation UI. |
| Language detection | **Removed** | English-only (NZ). |
| Sentence splitting | **From the human transcript** | Sentence boundaries are determined by the ESL author's paragraph structure (each `<p>` under "News story" is 1 sentence or 1 paragraph). Whisper timing is mapped to these authoritative boundaries. |

## 3. ESL News NZ Page Structure (Confirmed)

URL: `https://eslnews.org.nz/?p={id}`
Category page: `https://eslnews.org.nz/category/weekly-news/` — paginated, 10 articles/page

Key HTML elements on article page:

```
<h1 class="entry-title">  ← Title
<time class="entry-date" datetime="2026-07-13T21:30:00+12:00">  ← Date

<figure class="wp-block-audio">
  <audio controls src="https://eslnews.org.nz/wp-content/uploads/2026/07/...mp3"></audio>
</figure>

.entry-content  ← contains everything below

<strong>News story</strong>  ← header before transcript

<p>New Zealand's population density is 20 people per square kilometre...</p>
<p>However, population density does not give a complete picture...</p>
<p>We have a sparse population in many regional areas...</p>
...  ← each <p> is 1-3 sentences (natural paragraph breaks)

<strong>Answers</strong>  ← everything below this is Q&A, not transcript
```

**Scraper algorithm:**
1. Parse article HTML with BeautifulSoup
2. Title: `h1.entry-title` text
3. Date: `time.entry-date` datetime attribute
4. MP3 URL: `figure.wp-block-audio audio` src attribute
5. Transcript: Find `<strong>News story</strong>`, then collect all `<p>` elements until `<strong>Answers</strong>`. Concatenate their text, clean whitespace.
6. Slug: Derive from post ID `p={id}` or from URL path
7. Download MP3 to `data/articles/{slug}/audio.mp3`
8. Save transcript to `data/articles/{slug}/transcript.txt`

## 4. Architecture

```
AI_CA_Web/esl_listener/
├── pipeline/                  # Offline: data preparation
│   ├── esl_scraper.py         # Fetch article list, MP3, transcripts
│   ├── aligner.py             # faster-whisper forced alignment → sentence timestamps
│   └── db.py                  # SQLite schema + CRUD
├── web/                       # Runtime: FastAPI web app (adapted from TingJu)
│   ├── app.py                 # FastAPI app (routes: articles, playback)
│   ├── templates/
│   │   ├── index.html         # Article list
│   │   └── listen.html        # Sentence-by-sentence player
│   └── static/
│       └── js/
│           └── player.js      # Seek-based playback + loop logic
└── data/                      # Local storage (gitignored)
    ├── articles/{slug}/
    │   ├── audio.mp3          # Downloaded original MP3
    │   └── transcript.txt     # Raw transcript
    └── alignments/{slug}.json # Whisper word timestamps cache
```

### Data Flow (Updated)

```
   ESL News NZ                        Local SQLite
   ──────────────────                 ────────────
   Category page ──scraper──▶         articles table
   (HTML parse)                        status=fetched
        │
   Article page ──scraper──▶           articles.status=downloaded
   ├── MP3 ──download──▶ data/articles/{slug}/audio.mp3
   └── transcript ──extract──▶ data/articles/{slug}/transcript.txt
                                               │
                                          aligner.py
                                          (faster-whisper)
                                          word_timestamps=True
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                              alignments/{slug}.json    sentences table
                              (raw word timestamps)     article_id, num, text,
                                                         start_sec, end_sec
                                               │
                                               ▼
                                        FastAPI web app
                                        / → article list
                                        /listen/{slug} → sentence UI
```

## 5. Pipeline Detail

### 5.1 Scraper (`pipeline/esl_scraper.py`)

| Operation | Implementation |
|-----------|---------------|
| List article URLs | GET category page, extract `h2 > a[href]` links, follow pagination |
| Fetch article | GET individual post URL |
| Extract title | `select_one('h1.entry-title').text.strip()` |
| Extract date | `select_one('time.entry-date')['datetime']` |
| Extract MP3 URL | `select_one('figure.wp-block-audio audio')['src']` |
| Extract transcript | Find `<strong>News story</strong>`, iterate following `<p>` siblings until `<strong>Answers</strong>`, join text with newlines |
| Download MP3 | `requests.get(mp3_url, stream=True)` with Range header support |
| Save | Write MP3 + transcript files; insert/update SQLite row |

### 5.2 Aligner (`pipeline/aligner.py`)

| Step | Detail |
|------|--------|
| 1. Load audio | Read MP3 as float32 array, resample to 16kHz mono |
| 2. Run whisper | `faster_whisper.WhisperModel(model_size="tiny")` with `word_timestamps=True` |
| 3. Get word timestamps | `segments` iterator yields `(start, end, text, words_[(word, start, end), ...])` |
| 4. Split transcript into sentences | Use regex `re.split(r'(?<=[.!?])\s+', transcript)` |
| 5. Map timestamps → sentences | For each sentence, find the whisper word with the best fuzzy overlap; assign that word's `start` as sentence start, the last overlapping word's `end` as sentence end |
| 6. Handle gaps | If a sentence has no whisper match (rare for ESL audio due to clarity), interpolate: divide the gap evenly |
| 7. Cache | Save raw word timestamps to `data/alignments/{slug}.json` |
| 8. DB write | Bulk insert into `sentences` table; update `articles.status='aligned'` |

**Fuzzy matching function:** For the edge case where whisper transcribes "20 people per square" but the transcript says "20 people per square kilometre", we use `difflib.SequenceMatcher.ratio()` with a threshold of 0.6. If no word-level match, fall back to proportionally dividing the segment's time range across its constituent sentences.

### 5.3 Data Storage (`pipeline/db.py`)

SQLite with WAL mode for concurrent reads:

```sql
CREATE TABLE articles (
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

CREATE TABLE sentences (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id   INTEGER NOT NULL REFERENCES articles(id),
    sentence_num INTEGER NOT NULL,
    text         TEXT NOT NULL,
    start_sec    REAL,
    end_sec      REAL,
    UNIQUE(article_id, sentence_num)
);
```

## 6. Web App Detail

### 6.1 Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Article list: show all articles grouped by alignment status |
| `/listen/{slug}` | GET | Sentence-level player page |
| `/api/article/{slug}` | GET JSON | Article metadata + sentences array with timestamps |
| `/api/article/{slug}/audio` | GET | Stream full MP3 (needed for JS Audio seek) |

### 6.2 Playback Logic (`player.js`)

**Seek-based playback (singleton Audio object):**

```javascript
const audio = new Audio();

function playSentence(sentence) {
    audio.src = `/api/article/${slug}/audio`;
    audio.currentTime = sentence.start_sec;
    audio.play();
    audio.ontimeupdate = () => {
        if (audio.currentTime >= sentence.end_sec) {
            audio.pause();
            if (loopActive) {
                audio.currentTime = sentence.start_sec;
                audio.play();
            }
        }
    };
}
```

**Loop control:**
- Click loop toggle on a sentence → sets `loopSentenceId`. `loopActive = true`.
- On sentence end, if `loopActive` for this sentence → seek back to start, replay.
- Click toggle again, or click play on a different sentence → cancels loop.

**Full-article progress bar:**
- Separate HTML5 `<audio>` element bound to the full MP3.
- Shows current position / duration.
- Clicking on the progress bar seeks both players.

### 6.3 Key TingJu Modifications

| TingJu Original | Adapted |
|-----------------|---------|
| `app.py`: `/generate` runs edge-tts + translation per sentence | `app.py`: `/listen/{slug}` reads pre-aligned sentences from SQLite; `/api/article/{slug}/audio` streams MP3 |
| `results.html`: each sentence has `<audio controls src="...hash.mp3">` | `listen.html`: single hidden JS Audio object; each sentence row has [Play] and [Loop] buttons that control it |
| `audio_generator.py` — 100 lines of TTS orchestration | **Deleted.** No TTS code at all. |
| `results.js`: `pauseOtherAudios()` | `player.js`: singleton Audio manager with seek + ontimeupdate boundary + loop logic (~80 lines) |
| `text_processor.py`: NLTK/PySBD sentence splitting | **Deleted.** Sentence boundaries from human transcript. |
| Translation engine (translators), language detection (langdetect) | **Deleted.** English-only, no translation. |
| File upload / PDF parsing (PyMuPDF) | **Deleted.** Content sourced from ESL News NZ only. |

## 7. Directory Layout

```
AI_CA_Web/esl_listener/
├── __init__.py
├── pipeline/
│   ├── __init__.py
│   ├── esl_scraper.py      # ~120 lines
│   ├── aligner.py           # ~100 lines
│   └── db.py                # ~40 lines
├── web/
│   ├── __init__.py
│   ├── app.py               # ~80 lines
│   ├── templates/
│   │   ├── index.html       # Article list (~30 lines)
│   │   └── listen.html      # Sentence player (~50 lines)
│   └── static/
│       └── js/
│           └── player.js    # ~80 lines
├── data/
│   ├── articles/{slug}/
│   │   ├── audio.mp3
│   │   └── transcript.txt
│   └── alignments/{slug}.json
└── requirements.txt
```

Runs independently: `uvicorn esl_listener.web.app:app --port 8001`. No coupling to the existing backend.

## 8. Dependencies

```
# New (pip install):
faster-whisper          # Forced alignment, ~150MB model (tiny), CPU
requests                # HTTP client for scraping
beautifulsoup4          # HTML parsing

# Already available:
fastapi, uvicorn, jinja2
```

**ffmpeg**: Required by faster-whisper for audio decoding. `winget install ffmpeg` or `choco install ffmpeg`. Must be available in PATH.

## 9. Implementation Phases

| Phase | Scope | Est. |
|-------|-------|------|
| **P1: Scraper** | `esl_scraper.py`: list articles, download MP3 + extract transcript for one article, SQLite insert | 1h |
| **P2: Alignment** | `aligner.py`: faster-whisper pipeline, fuzzy match, SQLite write. Test on 1 ESL article. | 1.5h |
| **P3: Playback** | `app.py` routes, `listen.html` + `player.js`: seek-based sentence playback with loop toggle | 1.5h |
| **P4: Article list** | `index.html`: list all articles, show status, link to listen page | 0.5h |
| **P5: Batch & polish** | Batch scrape 20-30 recent articles, run alignment, verify playback on 3-5 | 1h |
| **P6: Extras** | Full-article progress bar, speed control, keyboard shortcuts | optional |

## 10. Future Enhancements (Not in v1)

- `audio.playbackRate` slider (0.5x-1.5x) — easy via HTMLMediaElement API
- Multiple NZ sources (NZ Herald Omny RSS, RNZ when Papa Reo ships transcripts)
- Vocabulary highlight — extract hard words, show definitions
- Dictation mode — type what you hear, compare with transcript
- Progress tracking — which sentences you've mastered
- Keyboard shortcuts: Space=play/stop, Left/Right=previous/next sentence
