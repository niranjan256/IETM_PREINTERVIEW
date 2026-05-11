import Tesseract from "tesseract.js";
import fs from "fs";
import path from "path";
import type { HotspotData, SectionInfo } from "./xmlService";
import {
  isOllamaAvailable,
  getOrComputeSectionEmbeddings,
  semanticMatch,
} from "./embeddingService";

const LANG_PATH = fs.existsSync(path.join(path.dirname(process.execPath), "eng.traineddata"))
  ? path.dirname(process.execPath)
  : undefined; 

const MIN_CONFIDENCE = 50;

const PADDING_X = 0.01; 
const PADDING_Y = 0.015; 

interface ImageDimensions {
  width: number;
  height: number;
}

interface DetectedPhrase {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function getImageDimensions(filePath: string): ImageDimensions | null {
  const buf = fs.readFileSync(filePath);

  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function matchSection(
  label: string,
  sections: SectionInfo[],
  mode: "exact" | "fuzzy" | "semantic"
): Promise<{ id: string; source: "string" | "semantic" }> {
  const normalizedLabel = normalize(label);
  if (!normalizedLabel || normalizedLabel.length < 3)
    return { id: "", source: "string" };

  for (const sec of sections) {
    const normalizedTitle = normalize(sec.title);
    if (normalizedLabel === normalizedTitle) {
      return { id: sec.id, source: "string" };
    }
  }

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

interface DetectedWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function extractWords(page: Tesseract.Page, minConf: number): DetectedWord[] {
  if (!page.blocks) return [];
  const words: DetectedWord[] = [];
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

function mergeWordsIntoPhrases(
  words: DetectedWord[],
  dims: ImageDimensions,
  seenLabels: Set<string>
): DetectedPhrase[] {
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

  const lines: DetectedWord[][] = [];
  let currentLine: DetectedWord[] = [filteredWords[0]];

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

  const phrases: DetectedPhrase[] = [];

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

async function runOCR(
  imagePath: string,
  dims: ImageDimensions,
  enhanced = false
): Promise<DetectedPhrase[]> {
  
  const worker1 = await Tesseract.createWorker(
    "eng",
    undefined,
    LANG_PATH ? { langPath: LANG_PATH } : undefined
  );
  let result1: Awaited<ReturnType<typeof worker1.recognize>>;
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

  const seenLabels = new Set<string>();
  const words1 = extractWords(result1.data, MIN_CONFIDENCE);
  const phrases = mergeWordsIntoPhrases(words1, dims, seenLabels);

  if (!enhanced) return phrases;

  const worker2 = await Tesseract.createWorker(
    "eng",
    undefined,
    LANG_PATH ? { langPath: LANG_PATH } : undefined
  );
  let result2: Awaited<ReturnType<typeof worker2.recognize>>;
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

  const words2 = extractWords(result2.data, 40);
  const phrases2 = mergeWordsIntoPhrases(words2, dims, seenLabels);

  console.log(`[ocr enhanced] pass1=${phrases.length} phrases, pass2 added ${phrases2.length} new phrases`);

  return [...phrases, ...phrases2];
}

function phraseToHotspot(
  phrase: DetectedPhrase,
  dims: ImageDimensions
): { x: number; y: number; w: number; h: number } | null {
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

async function detectHotspots(
  imagePath: string,
  sections: SectionInfo[],
  mode: "exact" | "semantic"
): Promise<HotspotData[]> {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const dims = getImageDimensions(imagePath);
  if (!dims) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

  if (mode === "semantic") {
    const ollamaUp = await isOllamaAvailable();
    if (!ollamaUp) {
      throw new Error("Ollama is not running. Start Ollama with nomic-embed-text to use AI Detect.");
    }
    console.log("[ai-detect] Pre-caching section embeddings");
    await getOrComputeSectionEmbeddings(sections);
  }

  const phrases = await runOCR(imagePath, dims, mode === "semantic");
  const hotspots: HotspotData[] = [];

  for (const phrase of phrases) {
    const text = phrase.text.trim();
    if (!text || text.length < 2) continue;
    if (/^\d+\.?\d*$/.test(text)) continue;
    if (text.length <= 2 && !/[a-zA-Z]{2}/.test(text)) continue;

    const coords = phraseToHotspot(phrase, dims);
    if (!coords) continue;

    const matchResult = await matchSection(text, sections, mode);
    const target = matchResult.id;

    if (!target && text.length < 4) continue;

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

export async function autoDetectHotspots(
  imagePath: string,
  sections: SectionInfo[]
): Promise<HotspotData[]> {
  return detectHotspots(imagePath, sections, "exact");
}

export async function autoDetectHotspotsAI(
  imagePath: string,
  sections: SectionInfo[]
): Promise<HotspotData[]> {
  return detectHotspots(imagePath, sections, "semantic");
}

export async function ocrRegion(
  imagePath: string,
  sections: SectionInfo[],
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number
): Promise<{ label: string; target: string; matchSource?: "string" | "semantic" }> {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const dims = getImageDimensions(imagePath);
  if (!dims) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

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
    LANG_PATH ? { langPath: LANG_PATH } : undefined
  );
  let regionResult: Awaited<ReturnType<typeof worker.recognize>>;
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

  const matchResult = await matchSection(text, sections, "fuzzy");
  console.log(`[ocr-region] matched "${text}" → ${matchResult.id || "(none)"}`);
  return {
    label: text,
    target: matchResult.id,
    matchSource: matchResult.id ? matchResult.source : undefined,
  };
}
