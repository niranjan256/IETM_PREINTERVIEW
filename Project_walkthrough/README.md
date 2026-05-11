# IETM Level 4 System

An **Interactive Electronic Technical Manual (IETM) Level 4** system for Indian defence equipment documentation. Converts Word documents (`.docx`) or S1000D Data Modules into structured XML, stores them in a Django backend, and serves through an offline-capable React PWA.

**Standards**: JSG 0852 / JSS 0251 / S1000D Issue 5

---

## Prerequisites

| Tool | Version | Required for |
|------|---------|-------------|
| Python | 3.10+ | Pipeline + Django backend |
| Node.js | 18+ | React frontend |
| pnpm | latest | React frontend |
| LibreOffice | any | WMF/EMF image conversion in pipeline (optional) |

---

## Quick Start (Fresh Clone)

### 1. Clone the repo

```bash
git clone https://github.com/niranjan256/IETM_level_4_with_RAG.git
cd IETM_level_4_with_RAG
```

### 2. Set up Django Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python manage.py runserver 8001
```

The database (`db.sqlite3`) and media files are included in the repo — no import step needed.

The backend runs at **http://localhost:8001**

### 3. Set up React Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

The frontend runs at **http://localhost:5173**

---

## Project Structure

```
├── backend/         # Django REST backend (SQLite/PostgreSQL)
│   ├── content/            # Content tree (ContentNode), import, search
│   │   ├── api_urls.py     # API routes (includes /prepages/ and /abbreviations/)
│   │   ├── views_global.py # Global asset endpoints (prepages, abbreviations)
│   │   └── management/commands/import_xml.py  # XML + global asset importer
│   ├── auth_api/           # Authentication
│   ├── bookmarks/          # User bookmarks
│   ├── notes/              # User notes
│   ├── search/             # Full-text search
│   ├── media/              # Manual images (per-manual) + _global/ assets
│   ├── db.sqlite3          # Pre-populated database
│   └── requirements.txt
│
├── frontend/  # React 18 PWA frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx               # Root component + TOC builder
│   │   │   └── components/
│   │   │       ├── LeftPanel.tsx     # Icon bar (Home, Dashboard, Abbreviations, Notes…)
│   │   │       ├── ContentArea.tsx   # Content renderer
│   │   │       ├── MediaFullscreen.tsx  # Image/video fullscreen with zoom + hotspots
│   │   │       ├── PrepagesViewer.tsx   # Inline PDF dialog for prepages
│   │   │       └── AbbreviationsDialog.tsx  # Searchable abbreviations dialog
│   │   ├── services/
│   │   │   └── contentService.ts    # API layer (incl. getPrepages, getAbbreviations)
│   │   └── lib/                     # IndexedDB, API client, sync queue
│   └── package.json
│
├── pipeline_updated/       # ACTIVE Python pipeline (DOCX → IETM XML)
│   ├── ietm_pipeline/
│   │   ├── main.py             # CLI: convert, convert-s1000d, add-global, list
│   │   ├── image_extractor.py  # Extracts + converts images (TIFF/BMP → PNG, WMF/EMF → PNG)
│   │   └── master_registry.py  # master.xml management + global asset registration
│   ├── docs/                   # Generated XML outputs + global assets
│   │   ├── master.xml          # Document index + <global-assets> block
│   │   ├── _global/            # prepages.pdf, abbreviations.csv (pipeline copies here)
│   │   ├── prepages.pdf        # Source prepages document
│   │   └── abb.csv             # Source abbreviations list
│   └── *.docx                  # Source manuals
│
├── pipeline/               # Legacy pipeline (reference only)
│
├── Image Upload Form Design (1)/  # Hotspot authoring tool
│   ├── src/                # React frontend
│   └── server/             # Node.js backend
│
├── ietm_authoring/         # Authoring workflow docs + example manifests
│
├── CLAUDE.md               # Detailed technical guide for Claude/developers
└── README.md               # This file
```

---

## Features

### Prepages (Cover / Foreword PDF)
A global PDF (cover pages, revision table, foreword) appears as the **first entry in the TOC** above all documents. Click it to view the PDF inline.

Register via the pipeline:
```bash
python -m ietm_pipeline.main add-global docs/ --prepages prepages.pdf
```

### Abbreviations
A project-wide glossary accessible from the **Abbreviations button** (book icon) in the left icon bar. Opens a searchable dialog with all abbreviations and their full forms.

Register via the pipeline:
```bash
python -m ietm_pipeline.main add-global docs/ --abbreviations abb.csv
```

Both together:
```bash
python -m ietm_pipeline.main add-global docs/ \
  --prepages prepages.pdf \
  --abbreviations abb.csv
```

### Image Hotspots (Fullscreen)
Image hotspots now work in the fullscreen viewer with full zoom support:
- Hotspot overlays stay aligned at any zoom level (50%–400%)
- Drag to pan when zoomed in
- Click a hotspot to navigate to the linked topic (closes fullscreen automatically)
- Arrow keys for accessibility panning

### Image Format Support
The pipeline automatically converts browser-incompatible image formats embedded in Word documents:
- **TIFF, BMP, WDP, ICO** → PNG (via Pillow)
- **WMF, EMF** → PNG (via LibreOffice `soffice`, if installed)
- Originals preserved as `<name>.<ext>.original`

---

## Deployment Modes

| Mode | Database | Use Case |
|------|----------|----------|
| `standalone` | SQLite (included) | Single machine / offline kiosk |
| `network` | PostgreSQL | Server + multiple clients on LAN |
| `docker` | PostgreSQL | Containerised stack (Django + Ollama + Nginx) |

Set `IETM_MODE=network` in `.env` and configure `DB_*` variables for PostgreSQL.

For Docker:
```bash
cd nginx && bash generate-certs.sh
docker-compose up -d
```

---

## Pipeline (Converting New Manuals)

Full authoring workflow:

```bash
cd pipeline_updated

# 1. Convert a DOCX manual
python -m ietm_pipeline.main convert <manual.docx> docs/ --doc-id MY_DOC

# 2. (Optional) Attach media, models, hotspots
python -m ietm_pipeline.main convert <manual.docx> docs/ \
  --hotspots hotspots.json \
  --models model_manifest.json \
  --media media_manifest.json

# 3. Register global assets (run once per IETM root)
python -m ietm_pipeline.main add-global docs/ \
  --prepages docs/prepages.pdf \
  --abbreviations docs/abb.csv

# 4. Import everything into Django
cd ../django_backend
python manage.py import_xml --source ../pipeline_updated/docs/master.xml --clear
```

---

## Default Login

Check the database for existing users, or create a new superuser:

```bash
cd django_backend
python manage.py createsuperuser
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Backend won't start | Activate the virtual environment (`venv\Scripts\activate`) and install requirements |
| Frontend can't reach backend | Ensure Django is running on port 8001; check CORS in `settings.py` |
| Missing images | Re-run `import_xml` from `master.xml`; check `media/` folder is present |
| Prepages not showing | Run `add-global` then `import_xml --clear`; hard-refresh browser (`Ctrl+Shift+R`) |
| WMF/EMF images not converting | Install LibreOffice and ensure `soffice` is on your system PATH |
| PDF blocked in dialog | `X_FRAME_OPTIONS = 'SAMEORIGIN'` must be set in `django_backend/ietm_backend/settings.py` |
| Port conflict with other IETM instance | Ensure this project uses port 8001 (Django) and the other uses port 8000 |
