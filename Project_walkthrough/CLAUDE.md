# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IETM Level 4 System — Project Guide for Claude

## What this project is

An **Interactive Electronic Technical Manual (IETM) Level 4** system for Indian defence equipment documentation. Converts `.docx` / S1000D XML → structured IETM XML → Django REST API → React 18 PWA with offline support.

Standards: **JSG 0852 / JSS 0251 / S1000D Issue 5**

---

## Sub-guides (read these instead of this file when working inside a subsystem)

| Area | File |
|------|------|
| Django backend (API, models, management commands) | [`backend/CLAUDE.md`](backend/CLAUDE.md) |
| React frontend (components, state, i18n, offline) | [`frontend/CLAUDE.md`](<frontend/CLAUDE.md>) |
| Python pipeline (DOCX → XML conversion) | [`pipeline_updated/CLAUDE.md`](pipeline_updated/CLAUDE.md) |
| Recommended Claude skills for this project | [`AGENTS.md`](AGENTS.md) |

---

## System architecture

```
[pipeline_updated]      [backend]        [frontend]
  Python CLI        →    Django + DRF        →       React 18 + Vite
.docx / S1000D XML      SQLite / PostgreSQL           PWA, offline-first
   → IETM XML              REST API                3D viewer, PDF, video
```

Three deployment modes:

| Mode | Database | Use case |
|------|----------|----------|
| `standalone` | SQLite | Single machine / offline kiosk |
| `network` | PostgreSQL | Server + LAN clients |
| `docker` | PostgreSQL | Containerised stack |

---

## Folder layout

| Path | Status | Description |
|------|--------|-------------|
| `pipeline_updated/` | **ACTIVE** | Python pipeline — always use this |
| `pipeline/` | **LEGACY — do not edit** | Old pipeline — reference only |
| `backend/` | active | Django REST backend |
| `frontend/` | **ACTIVE** | Current React frontend (pnpm) |
| `Image Upload Form Design (1)/` | active | Secondary React app — hotspot authoring UI (drag-and-drop hotspot injection into existing XML) |
| `ietm_authoring/` | docs | Authoring workflow guide, example manifests, sample DOCX files |
| `docker-compose.yml` | active | 3 services: PostgreSQL, Django, Nginx |
| `nginx/` | active | Nginx reverse proxy config + SSL cert generation |
| `migrate_data_to_docker.sh` | active | SQLite → PostgreSQL migration |

---

## Start here — local dev quickstart

**Note:** The repo includes a pre-populated `db.sqlite3` — no import step needed on first clone.

```bash
# 1. Backend
cd backend
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001                 # http://localhost:8001

# Create a superuser for admin access
python manage.py createsuperuser

# 2. Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev                                        # http://localhost:5173

# 3. Pipeline (when converting a document)
cd pipeline_updated
python -m ietm_pipeline.main convert <docx> <ietm_root>

# For S1000D data modules (skip DOCX processing)
python -m ietm_pipeline.main convert-s1000d <dm.xml> <ietm_root>

# Register global assets (prepages, abbreviations) — once per IETM root
python -m ietm_pipeline.main add-global <ietm_root> --prepages <pdf> --abbreviations <csv>

# Then import to Django:
cd ../backend && python manage.py import_xml --source <ietm_root>/master.xml --clear
```

---

## Environment variables (per mode)

### Standalone (`.env.standalone`)
```
IETM_MODE=standalone
SECRET_KEY=<any-random-string>
DEBUG=True
```

### Network / Docker (`.env.docker`)
```
IETM_MODE=network
DB_NAME=ietmdb
DB_USER=ietmuser
DB_PASSWORD=<password>
DB_HOST=localhost         # or "ietm-db" in docker
SECRET_KEY=<random>
ALLOWED_HOSTS=localhost,<server-ip>
```

---

## Gotchas

- **`pipeline/` is legacy** — never edit it. Always use `pipeline_updated/`.
- **`X_FRAME_OPTIONS = 'SAMEORIGIN'`** in `settings.py` — overridden from Django's default `DENY` so the prepages PDF can render inside an `<iframe>` on the same origin.
- **TOC race condition** — `App.tsx` must await `getPrepages()` and `getDocuments()` together in one `Promise.all` before calling `setTocItems()`. Doing them sequentially causes the prepages synthetic item to appear or disappear unexpectedly.
- **PowerShell startup script** — `start-ietm.ps1` has ampersand/string escaping bugs. Use `start-ietm.ps1.fixed` instead.
- **`SERVE_SPA=1`** — set this env var to have Django serve the React SPA directly (standalone production). Omit it for development (Vite handles the frontend).
- **pnpm only** — the frontend uses `pnpm` lockfile. Don't use `npm install` or `yarn` in `frontend/`.
- **API authentication** — all REST endpoints require token auth via `Authorization: Token <token>` header (except `/health`). Obtain tokens via `POST /api/auth/login/`.
- **i18n convention** — any new UI strings must be added to BOTH `frontend/src/locales/en.json` AND `frontend/src/locales/hi.json` simultaneously. Use `t('your.key')` in React components via `useTranslation()`.
- **Offline storage** — the PWA uses IndexedDB (database name `ietm-offline`, v2) and a sync queue to persist bookmarks/notes when offline. Sync is drained every 15 seconds when online.
- **Deployment superuser** — when preparing for deployment via `prepare_deployment` command, ensure a superuser exists for initial access.

---

## Authoring workflow (end-to-end)

```
1. python -m ietm_pipeline.main convert <docx> <ietm_root> [--hotspots] [--models] [--media] [--access-groups "GROUP1,GROUP2"]
2. Optionally enrich: edit hotspots.json, model_manifest.json, media_manifest.json
3. python -m ietm_pipeline.main add-global <ietm_root> --prepages <pdf> --abbreviations <csv>
4. python manage.py import_xml --source <ietm_root>/master.xml --clear
```

**Critical**: if hotspots are added/edited, you must re-run `convert` with `--hotspots` flag AND re-import with `import_xml`. Hotspot data is injected at pipeline stage; `import_xml` alone cannot recover them from an XML without hotspots.

Example manifests: `ietm_authoring/example_manifests/`

### Pipeline conversion stages (DOCX → IETM XML)

```
DOCX file
  ↓ docx_reader.py      Extract headings, text, embedded images
  ↓ tree_builder.py     Build document AST (SectionNode / LeafNode hierarchy)
  ↓ hotspot_merger.py   Inject hotspots.json / model_manifest.json / media_manifest.json
  ↓ image_extractor.py  Extract images from DOCX; convert incompatible formats (WMF → PNG)
  ↓ xml_emitter.py      Serialize AST → IETM XML + images/ directory
  ↓ master_registry.py  Register document in master.xml
```

### Advanced pipeline commands

```bash
# List all registered documents in an IETM root
python -m ietm_pipeline.main list <ietm_root>

# Unregister a document from master.xml
python -m ietm_pipeline.main unregister <ietm_root> <doc_id>
```

---

## Docker deployment

```bash
cd nginx && bash generate-certs.sh        # generate SSL certs
cp .env.docker .env
docker-compose up -d
# Optional: migrate existing SQLite data
bash migrate_data_to_docker.sh
```

Services: `ietm-db` (PostgreSQL 16), `ietm-backend` (Django+Waitress), `ietm-nginx`.

---

## Outstanding TODOs (April 2026)

### Backend
- Add `access_groups` M2M relation to `ContentNode`
- Filter API responses by user's access group
- Update `import_xml.py` to parse `accessGroups`, `securityClass` XML attributes
- **[In progress]** Linear block stream refactor (Phase 1): embed `media` payload inline in each block dict in `content_topic()` — see plan at `C:\Users\niran\.claude\plans\rustling-squishing-gadget.md`

### Frontend
- Classification banner in `TopBar` (security class display)
- 3D model viewer enhancements
- Video player improvements
- **[In progress]** Linear block stream refactor (Phase 2): drive right media panel from `blocks[]` instead of separate `mediaItems[]` array

---

## Management commands

### Backend (Django)

| Command | Purpose |
|---------|---------|
| `import_xml --source <path> --clear` | Import IETM XML into Django, optionally clearing existing data |
| `prepare_deployment --phase=1\|2 --target=docker --inputs ...` | Multi-phase deployment prep: ingest DOCXs (phase 1), build embeddings & frontend (phase 2) |
| `makemigrations` | Generate migration files after model changes |
| `migrate` | Apply pending migrations |
| `test [app]` | Run Django test suite |
| `createsuperuser` | Create an admin user |

See `backend/CLAUDE.md` for full details.

---

## Prerequisites

```
Python 3.10+, Node 18+, pnpm
LibreOffice (optional — for WMF/EMF conversion in pipeline)
pip install lxml Pillow          # pipeline deps
pip install -r requirements.txt  # django backend
```

## Test / sample assets
- GLB: `https://github.com/KhronosGroup/glTF-Sample-Models/raw/refs/heads/main/2.0/2CylinderEngine/glTF-Binary/2CylinderEngine.glb`
- MP4: `https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4`
- PDF: `https://s3vi.ndc.nasa.gov/ssri-kb/static/resources/NASA%20GSFC-X-673-64-1F.pdf`
- OBJ: `https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/fandisk.obj`
