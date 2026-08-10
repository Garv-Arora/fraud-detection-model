# Universal Sompo AI Claim Evidence Finder & RCU Assistant

An AI-powered Risk Control Unit (RCU) Claims Ingestion, Evidence Discovery, and Verification System designed for Universal Sompo General Insurance.

---

## 🌟 Features

- **Automated Document Ingestion**: Ingest claim cases via multi-file ZIP packages (Intimation PDFs, DL, RC, Spot/Crash photos) or bulk Excel spreadsheets matching the **Tera Bot 30-Header schema**.
- **AI-Powered Fact Extraction**: Extracts 30 standard claim data points from scanned PDFs and unstructured text using Google Gemini AI.
- **Web & News Evidence Search**: Automatically searches web news sources, police records, and public registries (via DuckDuckGo) for accident confirmation, timeline verification, and entity validation.
- **Multi-Factor Risk Scoring**: Calculates overall claim risk score based on mismatch detection across dates, locations, vehicle numbers, driver identities, and news coverage.
- **Interactive Dashboard**: Modern React + Vite frontend for claim reviewers, presenting real-time risk scores, claim details, evidence links, and audit logs.
- **One-Click Export**: Export verified claims into the official **Tera Bot 30-Header Excel format** or generate print-ready HTML/PDF evidence summary packs.

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
│   ├── public/               # Static assets & icons
│   ├── src/                  # React components & UI logic
│   ├── index.html            # Main HTML entrypoint
│   ├── package.json          # Frontend dependencies & scripts
│   └── vite.config.js        # Vite bundler configuration
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

Create a `.env` file in the root directory (or edit the auto-generated `.env`):

```env
# Google Gemini API Key for AI extraction & semantic analysis
GEMINI_API_KEY=your_gemini_api_key_here

# Server Configuration
HOST=0.0.0.0
PORT=8000
```

> **Note**: If `GEMINI_API_KEY` is not set, the system seamlessly falls back to regex-based extraction and heuristic scoring rules.

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

## 📄 License

Internal Proprietary Application — Developed for **Universal Sompo General Insurance**.
