import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isOllamaAvailable, clearAvailabilityCache } from "./embeddingService.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

// Resolve app root: handles both dev (cwd) and bundled exe (process.execPath parent)
const _appRoot =
  typeof process.pkg !== "undefined"
    ? path.dirname(process.execPath)
    : path.resolve(
        typeof __dirname !== "undefined"
          ? __dirname
          : path.dirname(fileURLToPath(new URL(import.meta.url))),
        ".."
      );

const OLLAMA_BIN = path.join(_appRoot, "bin", "ollama.exe");
const OLLAMA_MODELS = path.join(_appRoot, "bin", "models");

// Module state
let _ollamaProcess = null;
let _startupPromise = null;

/**
 * Ensures Ollama is running and ready. If not running, auto-starts the bundled
 * binary, waits for readiness, and ensures the embedding model is available.
 * Safe to call multiple times — concurrent callers await the same startup.
 */
export async function ensureOllamaReady() {
  // Fast path: already available
  const available = await isOllamaAvailable();
  if (available) {
    console.log("[ollama] Already running and available");
    return;
  }

  // Check if binary exists
  if (!fs.existsSync(OLLAMA_BIN)) {
    console.warn("[ollama] bin/ollama.exe not found. AI Detect will be unavailable.");
    return;
  }

  // Coalesce concurrent startup attempts
  if (_startupPromise) {
    console.log("[ollama] Startup already in progress, waiting...");
    return _startupPromise;
  }

  _startupPromise = _doStartupSequence().finally(() => {
    _startupPromise = null;
  });

  return _startupPromise;
}

async function _doStartupSequence() {
  console.log("[ollama] Starting startup sequence...");
  await _spawnOllama();
  console.log("[ollama] Process spawned, waiting for readiness...");
  await _waitForReady();
  console.log("[ollama] Ready, verifying local model...");
  await _verifyModelExists();
  console.log("[ollama] Startup complete");
}

async function _spawnOllama() {
  return new Promise((resolve) => {
    try {
      _ollamaProcess = spawn(OLLAMA_BIN, ["serve"], {
        detached: false,
        stdio: "ignore",
        env: {
          ...process.env,
          OLLAMA_MODELS,
          HOME: process.env.HOME ?? process.env.USERPROFILE ?? "",
        },
      });

      _ollamaProcess.on("error", (err) => {
        // Log but don't fail — launcher.js may have already started Ollama.
        // _waitForReady() will confirm whether it's actually up.
        console.warn("[ollama] Spawn warning:", err.message);
        _ollamaProcess = null;
      });

      _ollamaProcess.on("exit", (code) => {
        console.log(`[ollama] Process exited (code=${code})`);
        _ollamaProcess = null;
        clearAvailabilityCache();
      });
    } catch (err) {
      // Same — log and continue; let _waitForReady determine availability
      console.warn("[ollama] Spawn exception:", err.message);
      _ollamaProcess = null;
    }

    // Give Ollama a moment before polling starts
    setTimeout(() => {
      console.log("[ollama] Checking if Ollama is coming up...");
      resolve();
    }, 1500);
  });
}

async function _waitForReady(timeoutMs = 180_000) {
  const POLL_INTERVAL = 2000;
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        console.log("[ollama] /api/tags responded OK, Ollama is ready");
        return;
      }
    } catch (err) {
      // Not ready yet
    }

    if (attempts % 5 === 0) {
      console.log(`[ollama] Still waiting for engine to initialize (attempt ${attempts})...`);
    }

    // Wait before retrying
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error("Ollama did not become ready within 3 minutes. It might be blocked by a firewall or your antivirus.");
}

async function _verifyModelExists() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Failed to fetch model tags: HTTP ${res.status}`);
    }

    const data = await res.json();
    const models = data.models ?? [];
    const modelPulled = models.some(
      (m) =>
        m.name === OLLAMA_EMBED_MODEL ||
        m.name.startsWith(OLLAMA_EMBED_MODEL + ":")
    );

    if (modelPulled) {
      console.log(`[ollama] Model ${OLLAMA_EMBED_MODEL} is available locally`);
      return;
    }

    // Since this is an offline app, we do NOT attempt to pull from the internet.
    // The models must be bundled in bin/models.
    console.error(`[ollama] CRITICAL: Model ${OLLAMA_EMBED_MODEL} not found in local bin/models.`);
    console.error(`[ollama] Ensure the 'models' folder is correctly placed next to the executable.`);
  } catch (err) {
    console.warn(`[ollama] Model verification warning:`, err.message);
  }
}
