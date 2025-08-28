const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const OUT_FILE = path.join(REPO_ROOT, "manifest.json");
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const IGNORE_DIRS = new Set([".git", ".github", ".gitlab", ".vscode", "node_modules"]);
const CATEGORIES_ENV = (process.env.CATEGORIES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function walkImages(rootDir, relFromRoot = "") {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const full = path.join(rootDir, entry.name);
    const rel = path.posix.join(relFromRoot, entry.name.replaceAll("\\", "/"));
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkImages(full, rel));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMG_EXTS.has(ext) && rel !== "manifest.json") out.push(rel);
    }
  }
  return out;
}

function detectTopLevelFolders() {
  return fs.readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(naturalCompare);
}

(function main() {
  const categories = CATEGORIES_ENV.length ? CATEGORIES_ENV : detectTopLevelFolders();
  const manifest = {};
  for (const cat of categories) {
    const abs = path.join(REPO_ROOT, cat);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      manifest[cat] = [];
      continue;
    }
    const images = walkImages(abs, cat).sort(naturalCompare);
    images.sort((a, b) => {
      const score = (p) => (/(\bcover\b|\bhero\b|^0{1,3}\d)/i.test(path.basename(p)) ? 0 : 1);
      const sa = score(a), sb = score(b);
      return sa === sb ? naturalCompare(a, b) : sa - sb;
    });
    manifest[cat] = images;
  }

  const json = JSON.stringify(manifest, null, 2) + "\n";
  let changed = true;
  try { changed = fs.readFileSync(OUT_FILE, "utf8") !== json; } catch {}
  fs.writeFileSync(OUT_FILE, json, "utf8");
  console.log(`Wrote ${OUT_FILE}${changed ? "" : " (no changes)"}`);
})();
