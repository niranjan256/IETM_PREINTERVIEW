import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import {
  listDocuments,
  getFigures,
  getSections,
  getImagesDir,
  writeHotspots,
  writeFigureHotspots,
  removeAllHotspots,
  setDocsRoot,
  getDocsRoot,
} from "./xmlService.js";
import { autoDetectHotspots, autoDetectHotspotsAI, ocrRegion, rematchHotspots } from "./autoDetect.js";
import { clearEmbeddingCache, isOllamaAvailable } from "./embeddingService.js";
import { ensureOllamaReady } from "./ollamaService.js";

// ── Global crash guards — prevent unhandled rejections from killing the process
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception (process kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection (process kept alive):", reason);
});

// ── Trial expiry ────────────────────────────────────────────────────────────
const EXPIRY_DATE = new Date("2026-06-24T23:59:59");

function checkExpiry() {
  return Date.now() > EXPIRY_DATE.getTime();
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ── Expiry middleware — block all API calls if expired ───────────────────────
app.use("/api", (_req, res, next) => {
  if (checkExpiry()) {
    res.status(403).json({ error: "Trial expired. Contact the developer for a licensed version." });
    return;
  }
  next();
});

// ── POST /api/set-docs-root ─────────────────────────────────────────────────
app.post("/api/set-docs-root", (req, res) => {
  const { path: docsPath } = req.body;
  if (!docsPath || typeof docsPath !== "string") {
    res.status(400).json({ error: "Missing 'path' in request body" });
    return;
  }
  const resolved = path.resolve(docsPath);
  if (!fs.existsSync(resolved)) {
    res.status(400).json({ error: `Folder does not exist: ${resolved}` });
    return;
  }
  const masterXml = path.join(resolved, "master.xml");
  if (!fs.existsSync(masterXml)) {
    res.status(400).json({ error: `Not a valid docs folder (missing master.xml): ${resolved}` });
    return;
  }
  setDocsRoot(resolved);
  clearEmbeddingCache();
  res.json({ ok: true, path: resolved });
});

// ── GET /api/docs-root ──────────────────────────────────────────────────────
app.get("/api/docs-root", (_req, res) => {
  const root = getDocsRoot();
  res.json({ configured: !!root, path: root });
});

// ── GET /api/export-zip ─────────────────────────────────────────────────────
app.get("/api/export-zip", (_req, res) => {
  const root = getDocsRoot();
  if (!root) {
    res.status(400).json({ error: "Docs root not configured" });
    return;
  }
  res.setHeader("Content-Type", "application/zip");
  res.attachment("docs.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).json({ error: err.message }));
  archive.pipe(res);
  archive.directory(root, "docs");
  archive.finalize();
});

// ── GET /api/expiry ─────────────────────────────────────────────────────────
app.get("/api/expiry", (_req, res) => {
  res.json({ expired: checkExpiry(), expiryDate: EXPIRY_DATE.toISOString() });
});

// ── GET /api/ai-status ───────────────────────────────────────────────────────
app.get("/api/ai-status", async (_req, res) => {
  try {
    const available = await isOllamaAvailable();
    res.json({ ready: available });
  } catch {
    res.json({ ready: false });
  }
});

// ── GET /api/documents ──────────────────────────────────────────────────────
app.get("/api/documents", (_req, res) => {
  try {
    const docs = listDocuments();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/documents/:docId/figures ───────────────────────────────────────
app.get("/api/documents/:docId/figures", (req, res) => {
  try {
    const figures = getFigures(req.params.docId);
    res.json(figures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/documents/:docId/sections ──────────────────────────────────────
app.get("/api/documents/:docId/sections", (req, res) => {
  try {
    const sections = getSections(req.params.docId);
    // Clear embedding cache so new content-aware embeddings are built for this doc
    clearEmbeddingCache();
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/images/:docId/* ────────────────────────────────────────────────
app.get("/api/images/:docId/*", (req, res) => {
  const docId = req.params.docId;
  const filename = req.params[0];
  const imagesDir = getImagesDir(docId);
  const filePath = path.join(imagesDir, filename);

  // Prevent directory traversal
  if (!filePath.startsWith(imagesDir)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "Image not found" });
    }
  });
});

// ── POST /api/documents/:docId/hotspots ─────────────────────────────────────
app.post("/api/documents/:docId/hotspots", (req, res) => {
  try {
    const { figures } = req.body;
    if (!figures || typeof figures !== "object") {
      res.status(400).json({ error: "Request body must include 'figures' object" });
      return;
    }

    const result = writeHotspots(req.params.docId, figures);
    if (result.success) {
      res.json({ message: "Hotspots written successfully", backupPath: result.backupPath });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/:docId/figures/:figId/auto-detect ───────────────────
app.post("/api/documents/:docId/figures/:figId/auto-detect", async (req, res) => {
  try {
    const { docId, figId } = req.params;

    // Find the figure to get its image path
    const figures = getFigures(docId);
    const figure = figures.find((f) => f.id === figId);
    if (!figure) {
      res.status(404).json({ error: `Figure '${figId}' not found in document '${docId}'` });
      return;
    }

    // Resolve image path
    const imagesDir = getImagesDir(docId);
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\//, ""));

    // Get sections for target matching
    const sections = getSections(docId);

    // Run auto-detection
    const hotspots = await autoDetectHotspots(imagePath, sections);
    res.json({ hotspots, figureId: figId, count: hotspots.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/documents/:docId/hotspots ───────────────────────────────────
// Remove all hotspots from every figure in a document
app.delete("/api/documents/:docId/hotspots", (req, res) => {
  try {
    const result = removeAllHotspots(req.params.docId);
    if (result.success) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/:docId/figures/:figId/ai-detect ────────────────────
app.post("/api/documents/:docId/figures/:figId/ai-detect", async (req, res) => {
  try {
    const { docId, figId } = req.params;

    const figures = getFigures(docId);
    const figure = figures.find((f) => f.id === figId);
    if (!figure) {
      res.status(404).json({ error: `Figure '${figId}' not found in document '${docId}'` });
      return;
    }

    const imagesDir = getImagesDir(docId);
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\//, ""));
    const sections = getSections(docId);

    const hotspots = await autoDetectHotspotsAI(imagePath, sections);
    res.json({ hotspots, figureId: figId, count: hotspots.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/:docId/figures/:figId/ocr-region ───────────────────
app.post("/api/documents/:docId/figures/:figId/ocr-region", async (req, res) => {
  try {
    const { docId, figId } = req.params;
    const { x, y, w, h } = req.body;

    if ([x, y, w, h].some((v) => typeof v !== "number")) {
      res.status(400).json({ error: "Body must include numeric x, y, w, h (percentages)" });
      return;
    }

    const figures = getFigures(docId);
    const figure = figures.find((f) => f.id === figId);
    if (!figure) {
      res.status(404).json({ error: `Figure '${figId}' not found` });
      return;
    }

    const imagesDir = getImagesDir(docId);
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\//, ""));
    const sections = getSections(docId);

    const result = await ocrRegion(imagePath, sections, x, y, w, h);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/documents/:docId/figures/:figId/hotspots ───────────────────────
// Immediately sync hotspots for a single figure (used on delete)
app.put("/api/documents/:docId/figures/:figId/hotspots", (req, res) => {
  try {
    const { docId, figId } = req.params;
    const { hotspots } = req.body;
    if (!Array.isArray(hotspots)) {
      res.status(400).json({ error: "Request body must include 'hotspots' array" });
      return;
    }
    const result = writeFigureHotspots(docId, figId, hotspots);
    if (result.success) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/:docId/figures/:figId/rematch ───────────────────────
app.post("/api/documents/:docId/figures/:figId/rematch", async (req, res) => {
  try {
    const { docId } = req.params;
    const { hotspots } = req.body;
    if (!Array.isArray(hotspots)) {
      res.status(400).json({ error: "Request body must include 'hotspots' array" });
      return;
    }
    const sections = getSections(docId);
    const result = await rematchHotspots(hotspots, sections);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents/:docId/rematch-all ──────────────────────────────────
app.post("/api/documents/:docId/rematch-all", async (req, res) => {
  try {
    const { docId } = req.params;
    const figures = getFigures(docId);
    const sections = getSections(docId);
    const resultFigures = {};
    let totalRematched = 0;
    for (const fig of figures) {
      const r = await rematchHotspots(fig.hotspots, sections);
      resultFigures[fig.id] = r.hotspots;
      totalRematched += r.rematched;
    }
    res.json({ figures: resultFigures, totalRematched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve static frontend ────────────────────────────────────────────────────
import { fileURLToPath } from "url";
const _dirname_esm = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(new URL(import.meta.url)));

// In pkg, we want to serve the 'public' folder that is NEXT TO the .exe on disk.
// Fallback to internal /snapshot/public if external is missing.
const externalDistDir = typeof process.pkg !== 'undefined'
  ? path.join(path.dirname(process.execPath), "public")
  : path.join(_dirname_esm, "../public");

const internalDistDir = path.join(_dirname_esm, "../public");

let distDir = externalDistDir;
let usingInternal = false;

if (typeof process.pkg !== 'undefined' && !fs.existsSync(externalDistDir)) {
  distDir = internalDistDir;
  usingInternal = true;
}

console.log(`[server] Static files dir: ${distDir} ${usingInternal ? '(internal)' : '(external)'}`);

app.use(express.static(distDir));
app.get("*", (_req, res) => {
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error(`[server] ERROR: index.html not found at ${indexPath}`);
    res.status(404).send("Frontend assets not found. Ensure the 'public' folder exists next to the executable.");
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

export { app, ensureOllamaReady };
