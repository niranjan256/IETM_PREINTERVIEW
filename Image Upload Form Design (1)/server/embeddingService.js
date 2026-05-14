// ── Configuration ──────────────────────────────────────────────────────────
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const SEMANTIC_MATCH_THRESHOLD = parseFloat(
  process.env.SEMANTIC_MATCH_THRESHOLD ?? "0.72"
);

// ── Availability cache ─────────────────────────────────────────────────────
let _availableCache = null;
const AVAILABILITY_TTL_MS = 60_000; // 60 seconds

/**
 * Check if Ollama is reachable. Result is cached for 60 seconds.
 */
export async function isOllamaAvailable() {
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

// ── Embedding cache (keyed by normalized text) ─────────────────────────────
const _embeddingCache = new Map();

/**
 * Clear the cached section embeddings (call when docs root changes).
 */
export function clearEmbeddingCache() {
  _embeddingCache.clear();
  _availableCache = null;
}

/**
 * Clear the availability cache (used when Ollama process exits).
 */
export function clearAvailabilityCache() {
  _availableCache = null;
}

/**
 * Get embedding vector for a text string from Ollama.
 * Returns null on any error (timeout, network, model not pulled, etc.).
 */
async function getEmbedding(text) {
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
    const data = await res.json();
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Vector math ────────────────────────────────────────────────────────────

function l2Norm(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

/**
 * Cosine similarity between two vectors. Returns value in [-1, 1].
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) return 0;

  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}

// ── Section embedding pre-computation ──────────────────────────────────────

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pre-compute and cache embeddings for all section titles.
 * Skips sections whose normalized title is already cached.
 */
export async function getOrComputeSectionEmbeddings(
  sections
) {
  for (const sec of sections) {
    const key = normalize(sec.title);
    if (!key || _embeddingCache.has(key)) continue;

    // Embed title + body snippet so matching uses content, not just heading words
    const text = sec.snippet
      ? `${sec.title} — ${sec.snippet}`
      : sec.title;

    const emb = await getEmbedding(text);
    if (emb) {
      _embeddingCache.set(key, emb);
    }
  }
}

/**
 * Find the best semantically matching section for a label.
 * Returns the section ID and similarity score, or null if nothing passes the threshold.
 */
export async function semanticMatch(
  label,
  sections
) {
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
