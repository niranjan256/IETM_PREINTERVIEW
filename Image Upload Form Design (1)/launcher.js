import { spawn, exec } from "child_process";
import { join } from "path";
import { app, ensureOllamaReady } from "./server/index.js";

// Works in both ESM (dev) and CJS/pkg (exe)
const APP_ROOT = typeof process.pkg !== "undefined"
  ? require("path").dirname(process.execPath)
  : process.cwd();

const SERVER_PORT   = 3001;
const SERVER_URL    = `http://localhost:${SERVER_PORT}`;

// Keep terminal open on any unhandled crash so user can read the error
process.on("uncaughtException", (err) => {
  console.error("\n[ERROR]", err.message);
  console.log("\nPress Enter to exit...");
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(1));
});

console.log("===========================================");
console.log("       IETM Hotspot Editor");
console.log("===========================================");

// ── Step 1: Start Ollama ─────────────────────────────────────────────────────

async function startOllama() {
  console.log("\n[1/3] Starting Ollama (AI engine)...");
  try {
    await ensureOllamaReady();
    console.log("      Ollama ready ✓");
  } catch (err) {
    console.warn(`      Ollama failed to start: ${err.message}`);
    console.warn("      AI detection may be slow or unavailable.");
  }
}

// ── Step 2: Start Express server ─────────────────────────────────────────────

function freePort(port) {
  return new Promise((resolve) => {
    exec(
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`,
      () => resolve() // ignore errors — port may already be free
    );
  });
}

async function startServer() {
  return new Promise(async (resolve, reject) => {
    console.log("\n[2/3] Starting server...");

    const tryListen = () => {
      const server = app.listen(SERVER_PORT, () => {
        console.log(`      Server ready at ${SERVER_URL} ✓`);
        resolve(server);
      });
      server.on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
          console.log(`      Port ${SERVER_PORT} in use — freeing it...`);
          await freePort(SERVER_PORT);
          await new Promise(r => setTimeout(r, 800));
          tryListen();
        } else {
          reject(err);
        }
      });
    };

    tryListen();
  });
}

// ── Step 3: Open browser ─────────────────────────────────────────────────────

function openBrowser() {
  console.log("\n[3/3] Opening browser...");
  // Use Windows start command — works without any npm package
  exec(`start "" "${SERVER_URL}"`, (err) => {
    if (err) {
      console.log(`      Could not open browser automatically.`);
      console.log(`      Open manually: ${SERVER_URL}`);
    } else {
      console.log("      Browser opened ✓");
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await startOllama();
    await startServer();
    openBrowser();
    console.log("\n===========================================");
    console.log(`  App running at ${SERVER_URL}`);
    console.log("  Press Ctrl+C to stop.");
    console.log("===========================================\n");
  } catch (err) {
    console.error("\n[FATAL]", err.message);
    console.log("\nPress Enter to exit...");
    process.stdin.resume();
    process.stdin.once("data", () => process.exit(1));
  }
})();
