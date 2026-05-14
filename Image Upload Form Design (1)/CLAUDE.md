# IETM Hotspot Editor — Project Guide

## What this project is

A **vanilla JavaScript application** for editing interactive hotspots on IETM (Interactive Electronic Technical Manual) technical manual figures. Users draw clickable regions on images, link them to document sections, and export the results back into IETM XML files.

**Core workflow:**
1. Point to a folder of IETM XML documents (output from the IETM pipeline)
2. Select a document and view its figures (images)
3. Draw or auto-detect hotspot regions on each figure
4. Link hotspots to document sections semantically
5. Write hotspots back into the XML files on disk

---

## Folder structure

### `public/` — Vanilla JS UI (frontend)

The complete user interface, self-contained in three files:

| File | Purpose |
|---|---|
| `index.html` | HTML markup for all four screens: loading, expired, folder-picker, main editor, fullscreen viewer |
| `app.js` | ~45 KB vanilla JavaScript — all state, DOM manipulation, event handling, API calls in one file |
| `style.css` | ~17 KB hand-written CSS for layout and styling |

**No build step needed.** Served as-is by Express at `http://localhost:3001/public/`.

**Screens rendered by toggling CSS classes:**
- `#screen-loading` — Initial load state
- `#screen-expired` — Trial expiry wall (blocks all interaction after 2026-06-24)
- `#screen-folder` — Folder picker screen (native or text input)
- `#screen-main` — Main editor: document selector, figure grid, hotspot approval sidebar
- `#screen-fullscreen` — Full-window image viewer with interactive hotspot drawing canvas

**State management:** Single global `state` object in `app.js` tracks:
- `docsRoot` — path to the IETM XML folder
- `documents` — list of loaded documents
- `currentDoc` — selected document
- `figures` — figures for current document
- `hotspots` — hotspots per figure
- `selectedFigureId` — currently editing figure
- OCR confidence slider (saved to `localStorage`)

---

### `server/` — Express backend (Node.js TypeScript)

REST API server running on port 3001. Handles XML parsing, OCR, AI detection, and file I/O.

| File | Purpose |
|---|---|
| `index.ts` | Express app; all route handlers; middleware (CORS, trial expiry check); static file serving |
| `xmlService.ts` | Read/write IETM XML files using `@xmldom/xmldom`; parse figures, sections, hotspots; merge detected hotspots into XML with backup |
| `autoDetect.ts` | Tesseract.js OCR on images; Ollama API integration for AI hotspot detection; string + semantic matching to link detected labels to document sections |
| `embeddingService.ts` | Compute cosine-similarity embeddings via local Ollama (`http://localhost:11434` using `nomic-embed-text` model); cache embeddings in memory for fast semantic matching |
| `data/` | Tesseract language files and cached embeddings (optional) |

**Key routes:**
- `POST /api/set-docs-root` — Set path to IETM docs folder
- `GET /api/documents` — List all documents from `master.xml`
- `GET /api/documents/:docId/figures` — Get figures for a document
- `GET /api/documents/:docId/sections` — Get sections for linking
- `POST /api/documents/:docId/figures/:figId/auto-detect` — OCR-based hotspot detection
- `POST /api/documents/:docId/figures/:figId/ai-detect` — Ollama-based detection
- `POST /api/documents/:docId/figures/:figId/ocr-region` — OCR a specific region (text extraction)
- `PUT /api/documents/:docId/figures/:figId/hotspots` — Save hotspots for one figure
- `POST /api/documents/:docId/figures/hotspots` — Save hotspots for all figures
- `POST /api/documents/:docId/rematch` — Re-match unmatched hotspots for one figure
- `POST /api/documents/:docId/rematch-all` — Re-match all unmatched hotspots across document
- `POST /api/export-zip` — Export entire docs folder as ZIP
- `GET /api/expiry` — Check trial expiry status

**Trial expiry:** Middleware blocks all `/api/*` calls after 2026-06-24. Hardcoded in `index.ts`.

---

### `bin/` — Bundled executables

| File | Purpose |
|---|---|
| `ollama.exe` | Windows executable for Ollama (local LLM inference). Optional — required only if using AI-based hotspot detection. Must be running or reachable at `OLLAMA_BASE_URL` (default: `http://localhost:11434`) |

**Environment variables** (optional, in `.env` or process.env):
- `OLLAMA_BASE_URL` — Ollama API endpoint (default: `http://localhost:11434`)
- `OLLAMA_EMBED_MODEL` — Embedding model (default: `nomic-embed-text`)
- `OLLAMA_CHAT_MODEL` — Chat model for detection (default: `llama3.2`)

---

### `node_modules/` — Dependencies (runtime)

Minimal dependency set for Express backend + OCR:

| Package | Size | Purpose |
|---|---|---|
| `express` | ~50 KB | HTTP server framework |
| `tesseract.js` | ~50 MB | OCR engine (includes WASM + models) |
| `@xmldom/xmldom` | ~50 KB | DOM-like XML parsing and serialization |
| `archiver` | ~100 KB | Create ZIP files for export |
| `cors` | ~2 KB | Cross-origin request handling |

**Total:** ~85 MB (mostly Tesseract.js, which bundles pre-trained OCR models).

---

### Root-level files

| File | Purpose |
|---|---|
| `package.json` | NPM manifest; lists dependencies (express, tesseract.js, @xmldom/xmldom, archiver, cors) and scripts (dev, build:server) |
| `package-lock.json` | Lock file for exact versions; ensures reproducible installs |
| `README.md` | User-facing documentation: how to install and run the project |
| `CLAUDE.md` | This file — technical documentation for developers |
| `ATTRIBUTIONS.md` | License attributions (shadcn/ui, Unsplash — legacy from React era, outdated) |
| `eng.traineddata` | Tesseract English language model (~5 MB). Required for OCR to work offline. |
| `pnpm-workspace.yaml` | Legacy monorepo config — no longer used, can be deleted |
| `dist-electron-build/` | Locked folder containing old .exe build artifact — can be deleted when unlocked |

---

## How to run

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm run dev
```

This runs `tsx server/index.ts`, which:
- Starts Express on `http://localhost:3001`
- Serves `public/index.html` as the UI
- Loads Tesseract.js models into memory

### 3. Open the UI
Navigate to `http://localhost:3001` in your browser.

### 4. Use the app
1. **Folder picker:** Point to a folder containing IETM XML documents (e.g., the output of `ietm_pipeline`)
2. **Document selector:** Pick a document from `master.xml`
3. **Figure viewer:** See all figures in the document
4. **Hotspot editor:** Draw, auto-detect, or AI-detect hotspots
5. **Write back:** Save hotspots to XML files on disk

---

## Architecture

```
Browser (public/index.html + app.js)
         ↓ (fetch API calls to localhost:3001)
Express Server (server/index.ts)
  ├── xmlService → read/write IETM XML files
  ├── autoDetect → Tesseract OCR + Ollama AI
  ├── embeddingService → Ollama embeddings for semantic matching
  └── Static file serving → public/
```

**Execution flow:**
1. User opens `http://localhost:3001` in browser
2. Express serves `public/index.html`
3. `app.js` loads, initializes state
4. User picks docs folder via POST `/api/set-docs-root`
5. `xmlService` reads `master.xml` and parses all documents/figures/sections
6. User selects figure → `app.js` displays it on canvas
7. User draws or requests auto-detect → API call to `/api/.../auto-detect` or `/api/.../ai-detect`
8. `autoDetect` runs Tesseract (OCR) or calls Ollama (AI), returns bounding boxes
9. `embeddingService` computes semantic similarity to match detected text to sections
10. User approves hotspots → PUT `/api/.../hotspots` writes back to XML files

---

## Key concepts

### Hotspot
A clickable rectangular region on a figure, defined by:
- **x, y, width, height** — coordinates on the image
- **label** — text within the region (from OCR or manual entry)
- **description** — optional extra context
- **targetSectionId** — which document section it links to (optional; "unmatched" if empty)

### Figure
An image in the IETM XML document. Hotspots are drawn on figures.

### Section
A chapter, subsection, or topic in the IETM document. Hotspots are linked to sections.

### Semantic matching
Uses Ollama embeddings to find the best-matching section for a detected hotspot label. For example, if the label is "Engine", the matcher finds the section titled "Engine System" even if the text doesn't match exactly.

### Trial expiry
Hard-coded as 2026-06-24. After this date, the server blocks all API calls and the UI displays "Trial Expired". Controlled in `server/index.ts` line ~50.

---

## Development workflow

### Local dev
```bash
npm run dev
# Starts server on localhost:3001
# Edit server/*.ts files; changes picked up by tsx auto-reload
# Edit public/app.js, public/index.html, public/style.css; reload browser to see changes
```

### Compile server to JavaScript
```bash
npm run build:server
# Outputs to dist-server/index.js (esbuild)
# Can then run: node dist-server/index.js
```

### Useful environment variables
```bash
OLLAMA_BASE_URL=http://localhost:11434    # Ollama API (if using AI detection)
OLLAMA_EMBED_MODEL=nomic-embed-text       # Embedding model
OLLAMA_CHAT_MODEL=llama3.2                # Chat/detection model
```

---

## Troubleshooting

### "Trial Expired" wall appears immediately
Check `server/index.ts` line ~50. The trial date is hard-coded to 2026-06-24. Update it if needed.

### OCR not working
- Ensure `eng.traineddata` exists in the project root
- Check browser console for Tesseract.js errors
- Try reloading the page (Tesseract needs time to load WASM models)

### AI detection not working
- Ensure Ollama is running: `OLLAMA_BASE_URL` is reachable
- Check that the embedding model is downloaded: `ollama list`
- If missing, download it: `ollama pull nomic-embed-text`

### Hotspots not saved to XML
- Check that the docs folder path is correct (via `/api/set-docs-root`)
- Ensure the XML files are writable (not read-only)
- Check server logs for errors

### Performance is slow
- Large OCR operations block the main thread (Tesseract.js is CPU-bound)
- Large images take longer to OCR; consider downsampling beforehand
- Embedding computations for large documents can take time on first run (results are cached)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (HTML, CSS, DOM API) |
| Backend | Node.js, Express, TypeScript |
| XML parsing | `@xmldom/xmldom` |
| OCR | Tesseract.js (WASM-based, runs locally) |
| AI detection | Ollama (local LLM inference, optional) |
| Embeddings | Ollama `nomic-embed-text` model |
| File export | `archiver` (ZIP creation) |

---

## File deletion candidates

Safe to delete (old artifacts from React/Electron era):
- `guidelines/` — old documentation
- `dist-electron-build/` — old installer build output
- `ATTRIBUTIONS.md` — outdated attributions (mentions shadcn/ui, Unsplash)

Keep everything else.

---

## Contact / troubleshooting

For issues with IETM pipeline integration, see `pipeline_updated/CLAUDE.md`.  
For Django backend issues, see `django_backend/CLAUDE.md`.
