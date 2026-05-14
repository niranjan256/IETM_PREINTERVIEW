# IETM Hotspot Editor

A vanilla JavaScript application for editing interactive hotspots on technical manual figures. Draw clickable regions on images, link them to document sections, and export as XML.

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
npm install
```

### Running the Server

```bash
npm run dev
```

The Express server starts on `http://localhost:3001`. Open `public/index.html` in your browser to access the UI.

## Features

- **Document Selection** — Load IETM XML documents
- **Figure Viewer** — Display technical manual figures
- **Hotspot Drawing** — Click and drag to create clickable regions on images
- **Auto-Detection** — OCR-based hotspot detection via Tesseract.js
- **AI Detection** — Optional Ollama-based intelligent hotspot detection
- **Section Linking** — Link hotspots to document sections with semantic matching
- **XML Export** — Write hotspots back into IETM XML files
- **ZIP Export** — Download the complete modified document

## API Endpoints

- `POST /api/set-docs-root` — Set the path to IETM XML documents
- `GET /api/documents` — List all documents
- `GET /api/documents/:docId/figures` — Get figures for a document
- `GET /api/documents/:docId/sections` — Get sections for linking
- `POST /api/documents/:docId/figures/:figId/auto-detect` — OCR-based detection
- `POST /api/documents/:docId/figures/:figId/ai-detect` — AI-based detection
- `PUT/POST /api/documents/:docId/figures/:figId/hotspots` — Save hotspots to XML

## Requirements

- IETM XML documents with figures (from the IETM pipeline)
- Ollama (optional, for AI detection) — set `OLLAMA_BASE_URL` if using
