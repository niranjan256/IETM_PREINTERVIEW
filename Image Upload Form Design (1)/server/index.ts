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
} from "./xmlService";
import { autoDetectHotspots, autoDetectHotspotsAI, ocrRegion } from "./autoDetect";
import { clearEmbeddingCache } from "./embeddingService";

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception (process kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection (process kept alive):", reason);
});

const EXPIRY_DATE = new Date("2026-06-24T23:59:59");

function checkExpiry(): boolean {
  return Date.now() > EXPIRY_DATE.getTime();
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use("/api", (_req, res, next) => {
  if (checkExpiry()) {
    res.status(403).json({ error: "Trial expired. Contact the developer for a licensed version." });
    return;
  }
  next();
});

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

app.get("/api/docs-root", (_req, res) => {
  const root = getDocsRoot();
  res.json({ configured: !!root, path: root });
});

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

app.get("/api/expiry", (_req, res) => {
  res.json({ expired: checkExpiry(), expiryDate: EXPIRY_DATE.toISOString() });
});

app.get("/api/documents", (_req, res) => {
  try {
    const docs = listDocuments();
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/documents/:docId/figures", (req, res) => {
  try {
    const figures = getFigures(req.params.docId);
    res.json(figures);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/documents/:docId/sections", (req, res) => {
  try {
    const sections = getSections(req.params.docId);
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/images/:docId/*", (req, res) => {
  const docId = req.params.docId;
  const filename = (req.params as any)[0];
  const imagesDir = getImagesDir(docId);
  const filePath = path.join(imagesDir, filename);

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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/documents/:docId/figures/:figId/auto-detect", async (req, res) => {
  try {
    const { docId, figId } = req.params;

    const figures = getFigures(docId);
    const figure = figures.find((f) => f.id === figId);
    if (!figure) {
      res.status(404).json({ error: `Figure '${figId}' not found in document '${docId}'` });
      return;
    }

    const imagesDir = getImagesDir(docId);
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\

    const sections = getSections(docId);

    const hotspots = await autoDetectHotspots(imagePath, sections);
    res.json({ hotspots, figureId: figId, count: hotspots.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/documents/:docId/hotspots", (req, res) => {
  try {
    const result = removeAllHotspots(req.params.docId);
    if (result.success) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\
    const sections = getSections(docId);

    const hotspots = await autoDetectHotspotsAI(imagePath, sections);
    res.json({ hotspots, figureId: figId, count: hotspots.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const imagePath = path.join(imagesDir, figure.graphicSrc.replace(/^images\
    const sections = getSections(docId);

    const result = await ocrRegion(imagePath, sections, x, y, w, h);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { fileURLToPath } from "url";
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);
const distDir = path.join(__dirname_esm, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const autoDocsRoot = path.resolve(__dirname_esm, "../../pipeline_updated/ietm_new");
if (fs.existsSync(path.join(autoDocsRoot, "master.xml"))) {
  setDocsRoot(autoDocsRoot);
  console.log(`Auto-configured docs root: ${autoDocsRoot}`);
}

app.listen(PORT, () => {
  if (checkExpiry()) {
    console.log("WARNING: Trial has expired. Users will see an expiry notice.");
  }
  console.log(`Hotspot API server running at http://localhost:${PORT}`);
});
