import type { SectionInfo } from "./xmlService";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const SEMANTIC_MATCH_THRESHOLD = parseFloat(
  process.env.SEMANTIC_MATCH_THRESHOLD ?? "0.65"
);

let _availableCache: { value: boolean; ts: number } | null = null;
const AVAILABILITY_TTL_MS = 60_000; 

export async function isOllamaAvailable(): Promise<boolean> {
  if (_availableCache && Date.now() - _availableCache.ts < AVAILABILITY_TTL_MS) {
    return _availableCache.value;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const available = res.ok;
    _availableCache = { value: available, ts: Date.now() };
    return available;
  } catch {
    _availableCache = { value: false, ts: Date.now() };
    return false;
  }
}

const _embeddingCache = new Map<string, number[]>();

export function clearEmbeddingCache(): void {
  _embeddingCache.clear();
  _availableCache = null;
}

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

function l2Norm(v: number[]): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) return 0;

  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getOrComputeSectionEmbeddings(
  sections: SectionInfo[]
): Promise<void> {
  for (const sec of sections) {
    const key = normalize(sec.title);
    if (!key || _embeddingCache.has(key)) continue;

    const emb = await getEmbedding(sec.title);
    if (emb) {
      _embeddingCache.set(key, emb);
    }
  }
}

export async function semanticMatch(
  label: string,
  sections: SectionInfo[]
): Promise<{ id: string; score: number } | null> {
  const labelEmbedding = await getEmbedding(label);
  if (!labelEmbedding) return null;

  let bestId = "";
  let bestScore = 0;

  for (const sec of sections) {
    const key = normalize(sec.title);
    if (!key) continue;

    const secEmbedding = _embeddingCache.get(key);
    if (!secEmbedding) continue;

    const score = cosineSimilarity(labelEmbedding, secEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestId = sec.id;
    }
  }

  if (bestScore >= SEMANTIC_MATCH_THRESHOLD && bestId) {
    return { id: bestId, score: bestScore };
  }
  return null;
}
