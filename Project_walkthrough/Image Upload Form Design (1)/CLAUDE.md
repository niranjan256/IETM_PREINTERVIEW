# CLAUDE.md — IETM Hotspot Editor

## What this app is

The **IETM Hotspot Editor** is a desktop-class web application that lets human annotators **draw, review, detect, and write interactive hotspot regions** onto technical figures embedded in IETM XML documents.

**Purpose:** Downstream of the IETM pipeline, this tool injects clickable hotspot overlays into figures. Each hotspot is a rectangular region (defined in percentage coordinates) on an image that links to a section/topic elsewhere in the IETM. End users click hotspots in the IETM viewer to navigate.

**Distribution:** Packaged as a standalone Windows x64 executable via `@yao-pkg/pkg` (no Node.js installation required for end users).

**Trial license:** Hard-coded expiry date `2026-06-24T23:59:59`. After expiry, all API endpoints return HTTP 403 and the frontend shows a locked screen.

---

## Architecture at a glance

```
Frontend (Vite + React 18 + Tailwind)    Backend (Express on port 3001)
─────────────────────────────────────    ──────────────────────────────
App.tsx (all state)                       server/index.ts (Express app)
  ├─ TargetSectionPicker                   ├─ xmlService.ts (XML read/write)
  ├─ ApprovalPanel                         ├─ autoDetect.ts (OCR + matching)
  └─ FullscreenImageViewer                 ├─ embeddingService.ts (Ollama)
                                           └─ REST API endpoints
```

**Frontend:** Vite dev server (port 5173), hardcoded to call `http://localhost:3001` API.  
**Backend:** Express API on port 3001. Uses `@xmldom/xmldom` for XML parsing, Tesseract.js for OCR, optional Ollama for semantic embeddings.

---

## Folder layout

```
Image Upload Form Design (1)/
├── src/
│   ├── app/
│   │   ├── App.tsx                 All state, component orchestration
│   │   ├── components/
│   │   │   ├── ApprovalPanel.tsx       Sidebar: approve checkboxes + write gate
│   │   │   ├── TargetSectionPicker.tsx Searchable dropdown for linking hotspots
│   │   │   ├── FullscreenImageViewer.tsx Fullscreen: draw + edit + OCR
│   │   │   ├── figma/
│   │   │   └── ui/                     shadcn/ui component library (mostly unused)
│   │   ├── lib/
│   │   │   └── api.ts              Frontend HTTP client (base URL hardcoded to localhost:3001)
│   │   └── types.ts                TypeScript interfaces (Figure, Hotspot, Section, etc.)
│   ├── main.tsx                    React entry point
│   └── styles/                     Tailwind + theme CSS
├── server/
│   ├── index.ts                    Express app, routes, expiry middleware
│   ├── xmlService.ts               Parse/write XML, inject hotspots into ietm_output.xml
│   ├── autoDetect.ts               OCR + exact/fuzzy/semantic matching
│   └── embeddingService.ts         Ollama semantic embeddings cache
├── dist/                           (generated) Vite production build output
├── package.json                    Scripts and dependencies
├── vite.config.ts                  Vite config + obfuscation plugin for production JS
├── postcss.config.mjs              Tailwind CSS config
├── guidelines/
│   └── Guidelines.md               (template only — no actual content)
└── README.md                       Brief overview
```

---

## Dev quickstart

```bash
# Install
npm i

# Development: both frontend (Vite) and backend (Express) together
npm run dev:all

# Or run separately in two terminals:
npm run dev          # Frontend only (port 5173)
npm run server       # Backend only (port 3001)

# Production build
npm run build        # Outputs to dist/

# Package as Windows exe
# (requires @yao-pkg/pkg installed globally or as dev dep)
pkg .
```

### Environment variables (optional)
- `OLLAMA_BASE_URL` — Ollama endpoint (default: `http://localhost:11434`)
- `OLLAMA_EMBED_MODEL` — Ollama embedding model name (default: `nomic-embed-text`)
- `SEMANTIC_MATCH_THRESHOLD` — Cosine similarity threshold for matches (default: `0.65`)

---

## Frontend state model

All state lives in [App.tsx](src/app/App.tsx). Key buckets:

| State variable | Type | Purpose |
|---|---|---|
| `docsRootConfigured` | `null \| boolean` | Gate: `null`=loading, `false`=show folder picker, `true`=show editor |
| `expired` / `expiryDate` | `boolean` / `Date` | Trial expiry check |
| `documents` | `DocumentInfo[]` | List of documents from `master.xml` |
| `selectedDocId` | `string \| null` | Currently selected document |
| `figures` | `FigureData[]` | Array of figures parsed from `ietm_output.xml` (id, title, image path, existing hotspots) |
| `sections` | `SectionInfo[]` | All `<section>` and `<leaf>` elements as linkable targets |
| `workingHotspots` | `Record<figId, HotspotData[]>` | In-memory editable hotspot state (not yet written to XML) |
| `approvalStatus` | `Record<figId, boolean>` | Checkboxes in ApprovalPanel; gates the batch "Write to XML" button |
| `detecting`, `detectingAll` | `boolean` | Loading flags for Auto-Detect (exact match only) |
| `aiDetecting`, `aiDetectingAll` | `boolean` | Loading flags for AI-Detect (exact + fuzzy + semantic) |
| `writingFig` | `Record<figId, boolean>` | Loading flag for per-figure single writes |
| `removingAll`, `removingAllUnmatched` | `boolean` | Loading flags for bulk deletion |

**Important:** Approvals reset to `false` whenever any hotspot is edited. Only the batch "Write to XML" button in ApprovalPanel requires approval to be true for all figures.

---

## Components

### App.tsx
Root component. Orchestrates data flow, manages all state, renders the screen based on `docsRootConfigured` gate:
- `null` → blank loading screen
- `false` → folder picker (user selects `docs/` root)
- `true` → main editor (document dropdown, figure cards, approval sidebar)

### TargetSectionPicker.tsx
Searchable dropdown component. Allows user to select a section/topic to link a hotspot to. Takes props:
- `sections` — array of sections to search
- `value` — currently selected section ID
- `onChange` — callback when selection changes

### ApprovalPanel.tsx
Sticky sidebar showing:
- Checkbox per figure ("Approve this figure")
- "Write to XML (Batch)" button (only enabled if all figures approved)
- "Remove All Hotspots" button
- "Remove Unmatched Hotspots" button
- Approval status and write progress indicators

### FullscreenImageViewer.tsx
Fullscreen modal overlay for a single figure:
- Display the image
- Draw rectangular hotspot regions by dragging
- Show existing hotspots as overlays (edit label/desc/target or delete)
- Auto-OCR when user completes a draw (region-level OCR + fuzzy match, populates label + target automatically)
- Export hotspots back to parent App state on close

---

## Server API

All endpoints require the docs root to be configured (via `POST /api/set-docs-root`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/expiry` | Returns `{expired, expiryDate}` |
| `GET` | `/api/docs-root` | Returns `{configured, path}` — current docs folder |
| `POST` | `/api/set-docs-root` | Body: `{docsRoot: string}`. Sets docs folder; validates `master.xml` exists; clears embedding cache |
| `GET` | `/api/documents` | Returns `{documentId, title}[]` from `master.xml` |
| `GET` | `/api/documents/:docId/figures` | Parses `ietm_output.xml`, returns array of `{id, number, title, graphicSrc, hotspots}` |
| `GET` | `/api/documents/:docId/sections` | Returns all `<section>` and `<leaf>` elements as `{id, number, title, level}` |
| `GET` | `/api/images/:docId/*` | Serves image files from `docs/:docId/images/`. Path traversal protected. |
| `POST` | `/api/documents/:docId/hotspots` | Batch write hotspots for all figures. Body: `{hotspots: Record<figId, HotspotData[]>}`. Creates `.bak.YYYYMMDDTHHMMSS` backup. |
| `PUT` | `/api/documents/:docId/figures/:figId/hotspots` | Single-figure hotspot sync (no backup). Used on deletion. |
| `DELETE` | `/api/documents/:docId/hotspots` | Remove all `<hotspots>` from all figures in document. |
| `POST` | `/api/documents/:docId/figures/:figId/auto-detect` | OCR + exact match. Body: `{imageBase64}`. Returns `{hotspots: HotspotData[]}` |
| `POST` | `/api/documents/:docId/figures/:figId/ai-detect` | OCR + exact + fuzzy + semantic match. Requires Ollama. Body: `{imageBase64}`. Returns `{hotspots: HotspotData[]}` |
| `POST` | `/api/documents/:docId/figures/:figId/ocr-region` | OCR a region. Body: `{x, y, w, h, imageBase64}` (% coords). Returns `{label, target}` fuzzy match. |
| `GET` | `/api/export-zip` | Streams entire `docs/` folder as ZIP. |

---

## Hotspot lifecycle

```
┌─ Manual draw        ─┐
├─ Auto-Detect        ├─→ workingHotspots (in-memory state)
├─ AI-Detect          ┤      ↓ user edits label/desc/target
└─ Region OCR on draw ┘      ↓ approve checkboxes in sidebar
                             ↓
                        Write to XML (batch) — creates backup
                             OR
                        Write to XML (per-figure) — no backup
                             ↓
                        ietm_output.xml on disk updated
```

**Deletion:**
- Unmatched hotspots: via "Remove Unmatched Hotspots" button
- All hotspots: via "Remove All Hotspots" button
- Per-hotspot: delete button in FullscreenImageViewer
- All deletions write **immediately** to XML via `PUT /api/documents/:docId/figures/:figId/hotspots` (no approval gate, no backup)

---

## XML mechanics

### Expected document structure
The upstream pipeline (`pipeline_updated/`) generates a `docs/` folder:
```
docs/
├── master.xml                      Registry of all documents
├── <doc_id>/
│   ├── ietm_output.xml             Main document XML
│   └── images/
│       ├── fig_1.png
│       ├── fig_2.jpg
│       └── ...
```

### How hotspots are injected
[xmlService.ts](server/xmlService.ts) handles parsing and writing:

1. **Read:** Parse `ietm_output.xml` with `DOMParser`
2. **Merge:** For each figure:
   - Remove any existing `<hotspots>` child element
   - If new hotspots array is empty, skip (leave figure clean)
   - Build a new `<hotspots>` element with `<hotspot>` children
3. **Serialize:** Write back with `XMLSerializer`, restore `<?xml ...?>` declaration if missing
4. **Backup (batch only):** Create timestamped `.bak.YYYYMMDDTHHMMSS` before overwriting

### XML format
```xml
<figure id="fig_1" number="1">
  <title>Engine Overview</title>
  <graphic src="images/fig_1.png"/>
  <hotspots>
    <hotspot x="10" y="20" w="15" h="8" label="Valve" desc="Intake valve" target="sec_3_2"/>
    <hotspot x="45" y="55" w="12" h="10" label="Cylinder" desc="Main cylinder block" target="sec_4_1"/>
  </hotspots>
</figure>
```

**Coordinates:** Integer percentages (0–100) of image width/height. Rounded with `Math.round` on write.

---

## AI and OCR features

### Auto-Detect (mode: "exact")
[autoDetect.ts](server/autoDetect.ts) — No external dependencies, requires only Tesseract.js:
- OCR the image once (Tesseract `SPARSE_TEXT` page segmentation mode, confidence threshold 50)
- Match detected phrases to section titles using **exact normalized string match only**
- Fast, no semantic understanding

### AI-Detect (mode: "semantic")
Same as Auto-Detect, plus:
- OCR the image twice: `SPARSE_TEXT` (pass 1) + `AUTO` (pass 2, threshold 40)
- Deduplicate phrases across both passes
- Matching hierarchy:
  1. **Exact normalized match** — `title.toLowerCase().replace(/\s+/g, ' ').trim()`
  2. **Fuzzy containment + word overlap** — Levenshtein distance + word intersection scoring (threshold 0.3)
  3. **Ollama semantic embedding** — Compute embedding of each detected phrase, search section embeddings by cosine similarity (threshold 0.65)

**Requires:** Ollama running locally with `nomic-embed-text` model pulled.
```bash
ollama pull nomic-embed-text
ollama serve  # Keep running in background
```

If Ollama is unavailable, AI-Detect will throw an error. There is no graceful fallback.

### Region OCR (triggered on draw)
When user completes a hotspot region in FullscreenImageViewer:
- OCR that pixel region (converted from % coordinates)
- Match using mode `"fuzzy"` (exact + fuzzy only, no semantic)
- Automatically populate `label` and `target` on the new hotspot
- Return focus to user for approval/editing

### Embedding cache
[embeddingService.ts](server/embeddingService.ts) maintains an in-memory cache of section embeddings:
- First AI-Detect call computes embeddings for all sections, caches them
- Ollama availability is cached for 60 seconds (avoid repeated pings)
- Cache is cleared when docs root changes (new project loaded)

---

## Production packaging

### Build and package
```bash
npm run build         # Generates dist/
pkg .                 # Bundles into Windows exe (requires pkg installed)
```

### pkg configuration (package.json)
```json
"pkg": {
  "scripts": ["dist-server/**/*.js"],
  "assets": ["dist/**/*"],
  "targets": ["node18-win-x64"],
  "outputPath": "bin/"
}
```

### Exe runtime considerations
- The exe contains a snapshot filesystem; `__dirname` in bundled code is virtual
- [server/index.ts](server/index.ts) uses `fileURLToPath(import.meta.url)` to resolve paths correctly
- Tesseract language data (`eng.traineddata`) must be placed in the same directory as the `.exe`
- The frontend API still calls `http://localhost:3001` (hardcoded in [src/app/lib/api.ts](src/app/lib/api.ts))
- Auto-configuration path (`../../pipeline_updated/ietm_new`) will not resolve in the exe; the folder picker is the effective startup flow for end users

---

## Gotchas and constraints

1. **Trial expiry hardcoded** — `new Date("2026-06-24T23:59:59")` in [server/index.ts](server/index.ts). All endpoints return 403 after expiry.

2. **Frontend API base URL hardcoded** — `http://localhost:3001` in [src/app/lib/api.ts](src/app/lib/api.ts). No env-var override. Backend port is also hardcoded to 3001 in [server/index.ts](server/index.ts).

3. **Production JS is obfuscated** — Vite config uses `vite-plugin-obfuscator` with control flow flattening, base64 string arrays, and dead code injection. Source maps disabled. This is intentional for the trial product.

4. **Deletion writes immediately without approval or backup** — The per-figure `PUT /api/documents/:docId/figures/:figId/hotspots` endpoint (used by delete) has no backup. Only the batch `POST /api/documents/:docId/hotspots` creates timestamped `.bak` files. This is intentional to avoid `.bak` spam on every delete.

5. **AI-Detect requires Ollama** — If Ollama is not running, clicking "AI-Detect" will throw an error on the client. No graceful fallback exists.

6. **workingHotspots is the only source of truth** — Figures loaded from XML seed this state, but after that the in-memory copy can diverge from disk until explicitly saved.

7. **Approvals only gate batch write** — The "Write to XML (Batch)" button is gated by the approval checkboxes. The per-figure "Write to XML" buttons and all delete operations bypass approvals.

8. **Docs folder must match pipeline output structure** — Must contain `master.xml` at root and per-document subdirectories with `ietm_output.xml` and `images/` folder. This is produced by `pipeline_updated/`.

9. **Image coordinates are integer percentages** — Stored as 0–100 on each axis, rounded with `Math.round`. The viewer converts pixel positions ↔ percentages at draw time.

10. **Guidelines file is empty** — [guidelines/Guidelines.md](guidelines/Guidelines.md) is a blank template with no actual content.

11. **Many unused UI components** — The [src/app/components/ui/](src/app/components/ui/) folder contains dozens of shadcn/ui components (accordion, carousel, dialog, etc.) that are scaffolding from the Figma Make origin. Only a small subset are actually used.

12. **Auto-configure path is fragile** — [server/index.ts](server/index.ts) attempts to auto-configure the docs root to `../../pipeline_updated/ietm_new` on startup. This only works when run from inside the repo. In the packaged exe, this path will not resolve.

---

## When to refer to main CLAUDE.md

The main [CLAUDE.md](../CLAUDE.md) at the repo root contains:
- Full system architecture (pipeline → backend → frontend)
- Backend-specific guidance (models, management commands, migrations)
- Frontend-specific guidance (i18n, offline PWA, IndexedDB)
- Deployment modes (standalone, network, docker)

This hotspot editor is one tool in that larger system. Refer to the main guide for end-to-end context.
