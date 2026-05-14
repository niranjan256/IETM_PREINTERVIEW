import Tesseract from "tesseract.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  isOllamaAvailable,
  getOrComputeSectionEmbeddings,
  semanticMatch,
} from "./embeddingService.js";
import { ensureOllamaReady } from "./ollamaService.js";

// ── Tesseract language data path ────────────────────────────────────────────
// Priority: server/data/ (committed, offline-safe) → resourcesPath (Electron build) → exe dir (pkg build) → undefined
const _dirname_auto = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(new URL(import.meta.url)));

// In the packaged app __dirname === …/app.asar.unpacked/dist-server
// One level up is …/app.asar.unpacked — where tesseract packages and data live.
const _serverDataDir   = path.resolve(_dirname_auto, "data");           // dev: server/data
const _unpackedDataDir = path.join(_dirname_auto, "..", "..", "data");  // prod: resources/data
const _exeDir          = path.dirname(process.execPath);
const _resourcesDir    = (process).resourcesPath
  ? path.join((process).resourcesPath, "data")
  : undefined;

const LANG_PATH =
  fs.existsSync(path.join(_serverDataDir,   "eng.traineddata")) ? _serverDataDir   :
  fs.existsSync(path.join(_unpackedDataDir, "eng.traineddata")) ? _unpackedDataDir :
  (_resourcesDir && fs.existsSync(path.join(_resourcesDir, "eng.traineddata"))) ? _resourcesDir :
  fs.existsSync(path.join(_exeDir, "eng.traineddata")) ? _exeDir :
  undefined;

// ── Tesseract worker path ────────────────────────────────────────────────────
// esbuild sets __dirname to dist-server/ for all bundled code, so the
// default workerPath inside tesseract.js points to a non-existent location.
// We override it by resolving relative to _dirname_auto:
//   dev:  project/server/../node_modules/tesseract.js/…   → project/node_modules/…
//   prod: app.asar.unpacked/dist-server/../node_modules/… → app.asar.unpacked/node_modules/…
// (tesseract.js packages are asarUnpacked — see package.json)
const WORKER_PATH = (() => {
  const isPkg = typeof process.pkg !== "undefined";
  const exeDir = path.dirname(process.execPath);

  const candidates = [
    // 1. External node_modules (next to the .exe) — most reliable for pkg
    ...(isPkg ? [
      path.join(exeDir, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js")
    ] : []),

    // 2. Local node_modules (development)
    path.join(_dirname_auto, "..", "node_modules", "tesseract.js",
      "src", "worker-script", "node", "index.js"),

    // 3. Fallback — via process.resourcesPath if set (Electron)
    ...((process).resourcesPath ? [
      path.join((process).resourcesPath, "app.asar.unpacked",
        "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
    ] : []),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  console.log(`[ai-detect] Tesseract worker path: ${found || "NOT FOUND"}`);
  return found;
})();

// Minimum confidence threshold (0-100) for detected text
const MIN_CONFIDENCE = 50;
// Padding around detected text region as fraction of image dimension
const PADDING_X = 0.01; // 1% of image width
const PADDING_Y = 0.015; // 1.5% of image height

/**
 * Get image dimensions by reading the PNG/JPEG header.
 */
function getImageDimensions(filePath) {
  const buf = fs.readFileSync(filePath);

  // PNG: width at bytes 16-19, height at bytes 20-23
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG: scan for SOF0/SOF2 marker
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] === 0xff) {
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    } else {
      i++;
    }
  }

  return null;
}

/**
 * Normalize text: lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a detected label to a section.
 *
 * mode "exact"    — only accepts exact normalized match (Auto Detect)
 * mode "fuzzy"    — exact first, then containment + word overlap (region OCR)
 * mode "semantic" — exact + fuzzy first, then Ollama embedding fallback (AI Detect)
 */
async function matchSection(
  label,
  sections,
  mode
) {
  const normalizedLabel = normalize(label);
  if (!normalizedLabel || normalizedLabel.length < 3)
    return { id: "", source: "string" };

  // Exact match (all modes)
  for (const sec of sections) {
    const normalizedTitle = normalize(sec.title);
    if (normalizedLabel === normalizedTitle) {
      return { id: sec.id, source: "string" };
    }
  }

  // Fuzzy match (fuzzy + semantic modes)
  if (mode === "fuzzy" || mode === "semantic") {
    let bestMatch = "";
    let bestScore = 0;

    for (const sec of sections) {
      const normalizedTitle = normalize(sec.title);
      if (!normalizedTitle) continue;

      let score = 0;
      if (normalizedTitle.includes(normalizedLabel)) {
        score = normalizedLabel.length / normalizedTitle.length;
      } else if (normalizedLabel.includes(normalizedTitle)) {
        score = normalizedTitle.length / normalizedLabel.length;
      } else {
        const labelWords = normalizedLabel.split(" ");
        const titleWords = normalizedTitle.split(" ");
        const overlap = labelWords.filter((w) => titleWords.includes(w)).length;
        if (overlap > 0) {
          score = (overlap / Math.max(labelWords.length, titleWords.length)) * 0.8;
        }
      }

      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = sec.id;
      }
    }

    if (bestMatch) {
      return { id: bestMatch, source: "string" };
    }
  }

  // Semantic fallback (AI Detect mode only)
  if (mode === "semantic") {
    const result = await semanticMatch(label, sections);
    if (result) {
      console.log(
        `[ai-detect] Semantic match: "${label}" → section ${result.id} (score=${result.score.toFixed(3)})`
      );
      return { id: result.id, source: "semantic" };
    }
  }

  return { id: "", source: "string" };
}

// ── Shared OCR pipeline ─────────────────────────────────────────────────────

/**
 * Extract words from a Tesseract result page above a confidence threshold.
 */
function extractWords(page, minConf) {
  if (!page.blocks) return [];
  const words = [];
  for (const block of page.blocks) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          if (word.confidence < minConf) continue;
          const cleaned = word.text.trim();
          if (!cleaned) continue;
          words.push({ text: cleaned, confidence: word.confidence, bbox: word.bbox });
        }
      }
    }
  }
  return words;
}

/**
 * Merge a list of words into deduped phrases, appending only phrases whose
 * normalized text is not already in `seenLabels`.
 */
function mergeWordsIntoPhrases(
  words,
  dims,
  seenLabels
) {
  const filteredWords = words.filter((w) => {
    if (w.text.length <= 1) return false;
    if (!/[a-zA-Z]/.test(w.text)) return false;
    if (w.text.length === 2 && !/^[a-zA-Z]{2}$/.test(w.text)) return false;
    return true;
  });

  if (filteredWords.length === 0) return [];

  const lineThreshold = dims.height * 0.08;
  const gapThreshold = dims.width * 0.05;

  filteredWords.sort((a, b) => a.bbox.y0 - b.bbox.y0);

  const lines = [];
  let currentLine = [filteredWords[0]];

  for (let i = 1; i < filteredWords.length; i++) {
    const prevCenter = (currentLine[0].bbox.y0 + currentLine[0].bbox.y1) / 2;
    const curCenter = (filteredWords[i].bbox.y0 + filteredWords[i].bbox.y1) / 2;
    if (Math.abs(curCenter - prevCenter) < lineThreshold) {
      currentLine.push(filteredWords[i]);
    } else {
      lines.push(currentLine);
      currentLine = [filteredWords[i]];
    }
  }
  lines.push(currentLine);

  const phrases = [];

  for (const lineWords of lines) {
    lineWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    let current = { text: lineWords[0].text, bbox: { ...lineWords[0].bbox } };

    for (let i = 1; i < lineWords.length; i++) {
      const w = lineWords[i];
      const xOverlap = Math.min(current.bbox.x1, w.bbox.x1) - Math.max(current.bbox.x0, w.bbox.x0);
      const horizontalGap = w.bbox.x0 - current.bbox.x1;

      if (xOverlap > 0 || horizontalGap < gapThreshold) {
        current.text += " " + w.text;
        current.bbox.x0 = Math.min(current.bbox.x0, w.bbox.x0);
        current.bbox.x1 = Math.max(current.bbox.x1, w.bbox.x1);
        current.bbox.y0 = Math.min(current.bbox.y0, w.bbox.y0);
        current.bbox.y1 = Math.max(current.bbox.y1, w.bbox.y1);
      } else {
        const norm = normalize(current.text.trim());
        if (norm && !seenLabels.has(norm)) {
          seenLabels.add(norm);
          phrases.push({ text: current.text.trim(), bbox: { ...current.bbox } });
        }
        current = { text: w.text, bbox: { ...w.bbox } };
      }
    }
    const norm = normalize(current.text.trim());
    if (norm && !seenLabels.has(norm)) {
      seenLabels.add(norm);
      phrases.push({ text: current.text.trim(), bbox: { ...current.bbox } });
    }
  }

  return phrases;
}

/**
 * Run Tesseract OCR on an image and return merged phrase bounding boxes.
 *
 * When `enhanced=true` (AI Detect mode), a second pass with PSM.AUTO is run
 * to catch densely-packed text that SPARSE_TEXT mode misses. Unique phrases
 * from both passes are merged.
 */
async function runOCR(
  imagePath,
  dims,
  enhanced = false
) {
  // ── Pass 1: SPARSE_TEXT (good for sparse callout labels) ──────────────────
  const worker1 = await Tesseract.createWorker(
    "eng",
    undefined,
    { ...(LANG_PATH ? { langPath: LANG_PATH } : {}), ...(WORKER_PATH ? { workerPath: WORKER_PATH } : {}) }
  );
  let result1;
  try {
    await worker1.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      user_defined_dpi: "300",
    });
    result1 = await worker1.recognize(imagePath, {}, { blocks: true, text: true });
  } finally {
    await worker1.terminate().catch(() => {});
  }

  console.log(`[ocr pass1] confidence: ${result1.data.confidence}, blocks: ${result1.data.blocks?.length ?? 0}`);

  const seenLabels = new Set();
  const words1 = extractWords(result1.data, MIN_CONFIDENCE);
  const phrases = mergeWordsIntoPhrases(words1, dims, seenLabels);

  if (!enhanced) return phrases;

  // ── Pass 2: AUTO (better for dense text blocks / spec tables) ─────────────
  const worker2 = await Tesseract.createWorker(
    "eng",
    undefined,
    { ...(LANG_PATH ? { langPath: LANG_PATH } : {}), ...(WORKER_PATH ? { workerPath: WORKER_PATH } : {}) }
  );
  let result2;
  try {
    await worker2.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      user_defined_dpi: "300",
    });
    result2 = await worker2.recognize(imagePath, {}, { blocks: true, text: true });
  } finally {
    await worker2.terminate().catch(() => {});
  }

  console.log(`[ocr pass2] confidence: ${result2.data.confidence}, blocks: ${result2.data.blocks?.length ?? 0}`);

  // Use lower confidence threshold for pass 2 to catch dense labels
  const words2 = extractWords(result2.data, 40);
  const phrases2 = mergeWordsIntoPhrases(words2, dims, seenLabels);

  console.log(`[ocr enhanced] pass1=${phrases.length} phrases, pass2 added ${phrases2.length} new phrases`);

  return [...phrases, ...phrases2];
}

/**
 * Convert a phrase bbox to a percentage-based HotspotData (without target).
 */
function phraseToHotspot(
  phrase,
  dims
) {
  const bbox = phrase.bbox;
  const padX = dims.width * PADDING_X;
  const padY = dims.height * PADDING_Y;

  const x0 = Math.max(0, bbox.x0 - padX);
  const y0 = Math.max(0, bbox.y0 - padY);
  const x1 = Math.min(dims.width, bbox.x1 + padX);
  const y1 = Math.min(dims.height, bbox.y1 + padY);

  const xPct = Math.round((x0 / dims.width) * 100);
  const yPct = Math.round((y0 / dims.height) * 100);
  const wPct = Math.round(((x1 - x0) / dims.width) * 100);
  const hPct = Math.round(((y1 - y0) / dims.height) * 100);

  if (wPct < 3 || hPct < 3) return null;
  return { x: xPct, y: yPct, w: wPct, h: hPct };
}

// ── Shared detection core ───────────────────────────────────────────────────

async function detectHotspots(
  imagePath,
  sections,
  mode
) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const dims = getImageDimensions(imagePath);
  if (!dims) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

  if (mode === "semantic") {
    await ensureOllamaReady();
    console.log("[ai-detect] Pre-caching section embeddings");
    await getOrComputeSectionEmbeddings(sections);
  }

  const phrases = await runOCR(imagePath, dims, mode === "semantic");
  const hotspots = [];

  for (const phrase of phrases) {
    const text = phrase.text.trim();
    if (!text || text.length < 2) continue;
    if (/^\d+\.?\d*$/.test(text)) continue;
    if (text.length <= 2 && !/[a-zA-Z]{2}/.test(text)) continue;

    const coords = phraseToHotspot(phrase, dims);
    if (!coords) continue;

    const matchResult = await matchSection(text, sections, mode);
    const target = matchResult.id;

    // AI Detect: only create hotspots with a confident match
    if (mode === "semantic" && !target) continue;
    // Auto Detect: skip short unmatched labels (likely noise)
    if (mode === "exact" && !target && text.length < 4) continue;

    const tag = mode === "semantic" && matchResult.source === "semantic" ? " [semantic]" : "";
    console.log(`[${mode === "semantic" ? "ai" : "auto"}-detect] → "${text}" [${coords.x},${coords.y},${coords.w},${coords.h}] target=${target || "(none)"}${tag}`);

    hotspots.push({
      ...coords,
      label: text,
      desc: text,
      target,
      matchSource: target ? matchResult.source : undefined,
    });
  }

  return hotspots;
}

// ── Public exports ──────────────────────────────────────────────────────────

/**
 * Auto Detect — OCR + exact string match only.
 * No Ollama required.
 */
export async function autoDetectHotspots(
  imagePath,
  sections
) {
  return detectHotspots(imagePath, sections, "exact");
}

/**
 * AI Detect — OCR + exact match first, then Ollama semantic matching.
 * Throws if Ollama is unavailable.
 */
export async function autoDetectHotspotsAI(
  imagePath,
  sections
) {
  return detectHotspots(imagePath, sections, "semantic");
}

/**
 * Re-match unmatched hotspots (those with a label but no target) using
 * semantic matching. Hotspots that already have a target pass through unchanged.
 * Requires Ollama.
 */
export async function rematchHotspots(
  hotspots,
  sections
) {
  await ensureOllamaReady();
  await getOrComputeSectionEmbeddings(sections);

  let rematched = 0;
  const result = [];

  for (const hs of hotspots) {
    if (hs.target !== "" || !hs.label) {
      result.push(hs);
      continue;
    }
    const match = await matchSection(hs.label, sections, "semantic");
    if (match.id) {
      rematched++;
      console.log(`[rematch] "${hs.label}" → ${match.id}`);
    }
    result.push({ ...hs, target: match.id, matchSource: match.id ? match.source : undefined });
  }

  return { hotspots: result, rematched };
}

/**
 * OCR a specific region of an image (given as % coordinates) and match
 * the detected text to a section. Used when the user manually draws a
 * hotspot region in the fullscreen viewer.
 */
export async function ocrRegion(
  imagePath,
  sections,
  xPct,
  yPct,
  wPct,
  hPct
) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const dims = getImageDimensions(imagePath);
  if (!dims) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

  // Convert percentages to pixel coordinates
  const left   = Math.round((xPct / 100) * dims.width);
  const top    = Math.round((yPct / 100) * dims.height);
  const width  = Math.round((wPct / 100) * dims.width);
  const height = Math.round((hPct / 100) * dims.height);

  if (width < 2 || height < 2) {
    return { label: "", target: "" };
  }

  const worker = await Tesseract.createWorker(
    "eng",
    undefined,
    { ...(LANG_PATH ? { langPath: LANG_PATH } : {}), ...(WORKER_PATH ? { workerPath: WORKER_PATH } : {}) }
  );
  let regionResult;
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      user_defined_dpi: "300",
    });
    regionResult = await worker.recognize(imagePath, {
      rectangle: { left, top, width, height },
    });
  } finally {
    await worker.terminate().catch(() => {});
  }

  const text = regionResult.data.text
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.log(`[ocr-region] region=[${xPct},${yPct},${wPct},${hPct}] → "${text}"`);

  if (!text) {
    return { label: "", target: "" };
  }

  const ollamaUp = await isOllamaAvailable();
  const matchMode = ollamaUp ? "semantic" : "fuzzy";
  const matchResult = await matchSection(text, sections, matchMode);
  console.log(`[ocr-region] matched "${text}" → ${matchResult.id || "(none)"} (mode=${matchMode})`);
  return {
    label: text,
    target: matchResult.id,
    matchSource: matchResult.id ? matchResult.source : undefined,
  };
}
