# Universal Sompo AI Claim Evidence Finder & RCU Assistant

An AI-powered Risk Control Unit (RCU) Claims Ingestion, Evidence Discovery, and Verification System designed for Universal Sompo General Insurance.

---

## 🌟 Features

- **Bulk document ingestion**: Drop 50+ PDF intimation sheets, ZIP case archives, or a single Excel registry carrying 50 claim rows. Documents are parsed and searched **concurrently** — evidence for the first cases starts arriving while the remaining files are still being read — and each case's own search is reviewable separately.
- **Real client-side PDF parsing**: PDF text is extracted with `pdf.js` and visual line/column structure is reconstructed, so the two-column label/value layout of an intimation sheet survives into the 30-header extractor. Scanned PDFs with no text layer are reported as such rather than silently yielding an empty claim.
- **Live multi-engine evidence search**: Google News RSS (English **and** Hindi editions), Bing News RSS and DuckDuckGo, fanned out server-side from a Netlify Function. Optional real Google SERP via `SERPER_API_KEY` or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`.
- **Keyword-specific query planning**: Queries are generated in precision tiers from the case's own anchors — every written form of the registration plate, distinctive party names, accident spot plus loss date, Hindi vernacular phrasing used by regional dailies, and video archives. Tiers are interleaved so the vernacular tier always gets dispatched.
- **Explained relevance ranking**: Every result carries the reasons it ranked where it did (plate match, named party, location, publication within the loss-date window, source credibility, casualty-count agreement). Syndicated copies of one story collapse into a single record with a corroboration count.
- **Google Research Trail**: Every search also produces the exact clickable search URLs an investigator would type by hand — plain Google, Google News, Verbatim, a date-locked T-1→T+3 window, `site:`-restricted queries against twelve Indian dailies, ePaper archives, YouTube, Google Maps and the Vahan registry. These work with no network dependency and no API key, which is what makes them the reliable fallback for district-level incidents.
- **Evidence-grounded briefings**: The synthesized summary cites only records that were actually returned. When nothing is found it says so plainly, and states that a nil digital footprint is not by itself a fraud indicator.
- **Multi-Factor Risk Scoring**: Calculates overall claim risk score based on mismatch detection across dates, locations, vehicle numbers, driver identities, and news coverage.
- **One-Click Export**: 30-header Excel export, a batch register CSV, the full evidence bundle as JSON, and the research trail as CSV.

---

## 📁 Repository Structure

```
Universal Sompo/
├── backend/
│   ├── data/                 # SQLite database storage (app.db)
│   ├── static/               # Uploaded evidence and static files
│   ├── templates/            # Ingestion Excel template (claims_upload_template.xlsx)
│   ├── database.py           # SQLAlchemy database connection & session setup
│   ├── exporter.py           # Excel 30-header export & HTML report generator
│   ├── extractor.py          # PDF parsing & Gemini LLM extraction engine
│   ├── main.py               # FastAPI backend server routes & REST endpoints
│   ├── models.py             # Database ORM models (Case, Evidence, ImageMatch, AuditLog)
│   ├── requirements.txt      # Backend Python dependencies
│   ├── schemas.py            # Pydantic data schemas
│   ├── scorer.py             # Heuristic & LLM risk scoring algorithm
│   ├── search_engine.py      # DuckDuckGo search integration
│   └── test_app.py           # Integration & unit test suite
├── frontend/
│   ├── netlify/functions/
│   │   └── search.mjs        # Serverless multi-engine live search (see below)
│   ├── public/               # Static assets & icons
│   ├── src/
│   │   ├── lib/
│   │   │   ├── searchIntel.js        # Anchor extraction, tiered query planning, ranking
│   │   │   ├── googleDeepLinks.js    # "Type it into Google yourself" research trail
│   │   │   ├── searchService.js      # Search orchestration + transport fallback
│   │   │   ├── evidenceSummary.js    # Evidence-grounded briefing generator
│   │   │   ├── pdfTextExtractor.js   # pdf.js text layer + line reconstruction
│   │   │   ├── claimFactExtractor.js # 30-header extraction from document text
│   │   │   └── batchEngine.js        # Concurrent parse + search pipeline
│   │   └── components/       # React UI (Search Lab, batch workspace, results panel)
│   ├── index.html            # Main HTML entrypoint
│   ├── package.json          # Frontend dependencies & scripts
│   └── vite.config.js        # Vite config (also serves the search function in dev)
├── samples/
│   ├── CL26140317.zip        # Real Universal Sompo sample claim package 1
│   ├── CL26148443.zip        # Real Universal Sompo sample claim package 2
│   ├── CL26160678.zip        # Real Universal Sompo sample claim package 3
│   ├── CL26166635.zip        # Real Universal Sompo sample claim package 4
│   └── Headers - Tera Bot.xlsx # Sample 30-header batch upload Excel dataset
├── create_template.py        # Script to generate Excel claims ingestion template
├── Dockerfile                # Multi-stage production container build definition
├── docker-compose.yml        # Docker Compose configuration for container deployment
├── requirements.txt          # Python dependencies
├── run.py                    # One-command runner (NPM install, Vite build, Uvicorn server)
└── README.md                 # System documentation
```

---

## 🚀 Quickstart (Local Development)

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.x or higher (with `npm`)

### 1-Step Launcher

Simply run the master entrypoint script from the project root:

```bash
python run.py
```

`run.py` automatically:
1. Installs frontend dependencies via `npm install` (if `node_modules` is missing).
2. Compiles the React + Vite frontend into `frontend/dist`.
3. Creates a default `.env` configuration file (if missing).
4. Launches the FastAPI backend server on `http://localhost:8000`.

Open your browser and navigate to **`http://localhost:8000`** to access the dashboard.

---

## 🔑 Environment Configuration

Copy the template and fill in what you have. Every key is optional.

```bash
cp .env.example .env
```

`.env` is gitignored and must never be committed.

### Running the Search Lab on localhost

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

The Vite dev server runs the real `/api/search` function in-process, so live
search works locally without the Netlify CLI or the Python backend. Provider
keys are read from `.env` at the repository root (or in `frontend/`) and passed
to that function through `process.env` — **server-side only; they are never
bundled into the client.**

> If you add a key to `.env` while the dev server is running, **restart it** —
> the environment is read at startup.

### Enabling Facebook and Instagram discovery

Social discovery needs a SERP index. Neither platform exposes post content to
anonymous crawlers, so the free engines return only login walls; a paid index is
the only route to publicly indexed posts.

```env
SERPER_API_KEY=your_serper_key_here      # https://serper.dev — free tier available
```

Restart `npm run dev`, then run any search: a **Social** filter appears beside
News / YouTube / Web, each post carries a Facebook or Instagram badge, the page
name, a matched-field checklist and a **View Original Post** button opening the
exact URL the provider returned.

Without the key nothing breaks. News and web search run exactly as before across
thirteen Indian-language editions, and the Search Lab states plainly that the
social tier was not searched — it is never left silently empty.

### Other keys

| Key | Effect if absent |
|---|---|
| `SERPER_API_KEY` | No social discovery, no live Google SERP. Everything else unchanged. |
| `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | Fallback Google provider, used only when `SERPER_API_KEY` is absent. |
| `GEMINI_API_KEY` | Falls back to regex extraction and heuristic scoring. |
| `HOST` / `PORT` | Only used by the optional Python backend (`python run.py`). |

---

## 🐳 Running with Docker

You can containerize and run the complete application using Docker and Docker Compose:

```bash
# Build and start container
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

The application will be accessible at `http://localhost:8000`.

---

## 🧪 Running Unit Tests

Execute the automated backend test suite:

```bash
python -u -m unittest backend/test_app.py
```

Tests verify:
1. Sample ZIP package ingestion & PDF intimation parsing.
2. Loading sample case presets into SQLite database.
3. Fetching case lists with 30 Tera Bot properties.
4. Tera Bot 30-header Excel report generation.
5. Batch Excel spreadsheet upload and row parsing.


---

## 🔎 How search works

The deployed site is a static SPA, so a browser cannot call Google News, Bing or
DuckDuckGo directly — CORS blocks all three. The search therefore runs in a
**Netlify Function** (`frontend/netlify/functions/search.mjs`), which fans the
queries out server-side and returns real, live, keyword-specific results.

`searchService.js` picks a transport once per session and caches the choice, so a
50-case batch does not pay 50 failed round-trips:

| Order | Transport | When it is used |
|---|---|---|
| 1 | `/api/search` — Netlify Function | Production, and local `npm run dev` |
| 2 | `/api/search/workbench` — FastAPI | When the Python backend is running (`python run.py`) |
| 3 | offline | Neither reachable — the Google Research Trail is still fully functional and is clearly labelled as manual-links-only |

**Local development**: `vite.config.js` mounts the same function module on the
dev server, so `npm run dev` has a working `/api/search` without needing the
Netlify CLI or the Python backend.

**Optional real Google results**: set either `SERPER_API_KEY`, or
`GOOGLE_CSE_KEY` together with `GOOGLE_CSE_CX`, in the Netlify site environment.
Without a key the function still returns live results from Google News RSS
(English and Hindi), Bing News RSS and DuckDuckGo.

**Facebook and Instagram discovery** is enabled by the same `SERPER_API_KEY`.
Publicly indexed posts are found through Google's index as Serper reports it —
neither platform is contacted directly, no authentication is bypassed, and only
URLs the provider actually returned are surfaced. Each investigation adds up to
six SERP queries (three per platform), dispatched on their own parallel shard so
they cost no extra wall-clock. With no key configured the social queries are
never dispatched and every existing search behaves exactly as before.

The key is read from the environment only. It is never bundled into the client,
never logged, and never returned by the API; `.env` is gitignored.

### Why there is no social-media search

Instagram and Facebook discovery was built, tested against every free anonymous
route, and then removed because it does not work without paying for it.

Measured, not assumed — `site:instagram.com` / `site:facebook.com` sweeps across
DuckDuckGo, Bing web, Mojeek, SearxNG and Marginalia returned **zero genuine post
URLs**. DuckDuckGo and Mojeek answer with a bot challenge; SearxNG returns login
redirects; Bing ignores the `site:` filter on those domains entirely. Across five
best-case queries designed to maximise the hit rate, 68 results contained no real
post — only platform homepages and login walls. Neither platform exposes post
content to general web crawlers any more.

Consequently any URL on `instagram.com`, `facebook.com`, `fb.watch`, `x.com` or
`threads.net` is **rejected by default**, so a login wall can never be filed as a
corroborating source.

That rejection is lifted for one case only: a Facebook or Instagram URL returned
by a **keyed** SERP provider (`SERPER_API_KEY`), which is a real search index
rather than a scraped result page. Those are genuine indexed posts, and they flow
through the normal ranking path. The same URL arriving from an anonymous engine
is still rejected.

Social results are also held to a stricter identity rule than web pages. Google
composes a social snippet from the post text *and* its comment thread, so a
claimant's name in a snippet is frequently just someone who commented — during
testing a walk-in-interview job advert matched a road-accident claimant purely
because he had reacted to it. Person and operator matching therefore reads only
the post's own title and URL, and a social post can reach **CONFIRMED** only on a
registration number, which is unambiguous wherever it appears. A name or operator
match carries it no further than **STRONG**.

### A note on evidence integrity

Nothing in the search path fabricates a result. Earlier revisions shipped a
client-side "synthesizer" that returned hardcoded scenario data with invented
article URLs; that module has been removed. If a claim has no digital footprint
the system reports zero records and says so, because a fabricated evidence link
in a fraud file is worse than no link at all.

---

## 📄 License

Internal Proprietary Application — Developed for **Universal Sompo General Insurance**.
