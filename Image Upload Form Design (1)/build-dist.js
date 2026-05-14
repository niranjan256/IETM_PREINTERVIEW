import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT  = path.dirname(fileURLToPath(import.meta.url));
const OUT   = path.join(ROOT, "release");

console.log("[build-dist] Creating distribution folder...");

// Clean and recreate output folder
if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) { console.warn(`  skip (not found): ${src}`); return; }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1. Main executable
console.log("[build-dist] Copying exe...");
copy(path.join(ROOT, "ietm-hotspot-editor.exe"), path.join(OUT, "ietm-hotspot-editor.exe"));

// 2. Ollama + models
console.log("[build-dist] Copying bin/ (Ollama + models)...");
copyDir(path.join(ROOT, "bin"), path.join(OUT, "bin"));

// 3. Vanilla JS UI
console.log("[build-dist] Copying public/ (UI)...");
copyDir(path.join(ROOT, "public"), path.join(OUT, "public"));

// 4. Tesseract English model
console.log("[build-dist] Copying eng.traineddata...");
copy(path.join(ROOT, "eng.traineddata"), path.join(OUT, "eng.traineddata"));

// 5. All node_modules — copy everything so no missing dependency issues
console.log("[build-dist] Copying node_modules (this takes a moment)...");
copyDir(path.join(ROOT, "node_modules"), path.join(OUT, "node_modules"));

// Summary
console.log("\n[build-dist] ✓ Done! Distribution folder:");
console.log(`  ${OUT}`);
console.log("\nContents:");
for (const entry of fs.readdirSync(OUT)) {
  const stat = fs.statSync(path.join(OUT, entry));
  const size = stat.isDirectory() ? "(folder)" : `${(stat.size / 1024 / 1024).toFixed(1)} MB`;
  console.log(`  ${entry.padEnd(35)} ${size}`);
}

function getDirSize(dir) {
  let size = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) size += getDirSize(p);
    else size += fs.statSync(p).size;
  }
  return size;
}

const totalBytes = getDirSize(OUT);
console.log(`\nTotal size: ${(totalBytes / 1024 / 1024).toFixed(0)} MB`);
console.log("\nTo distribute: zip the 'release/' folder and share it.");
console.log("Users unzip and double-click ietm-hotspot-editor.exe — no setup needed.");
