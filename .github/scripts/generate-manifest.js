const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const OUT_FILE = path.join(REPO_ROOT, "manifest.json");

// Add/keep extensions your site can actually render
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);

const IGNORE_DIRS = new Set([".git", ".github", ".gitlab", ".vscode", "node_modules"]);
const VERBOSE = (process.env.VERBOSE || "1") !== "0";
const CATEGORIES_ENV = (process.env.CATEGORIES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function walkImages(rootDir, relFromRoot = "") {
  let out = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = path.join(rootDir, name);
    const rel = path.posix.join(relFromRoot, name.replaceAll("\\", "/"));
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      out = out.concat(walkImages(full, rel));
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (!IMG_EXTS.has(ext)) continue;
      if (rel === "manifest.json") continue;
      out.push(rel);
    }
  }
  return out;
}

function detectTopFoldersWithImages() {
  const folders = fs.readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
    .map(e => e.name).sort(natural);

  const withImgs = [];
  for (const f of folders) {
    const found = walkImages(path.join(REPO_ROOT, f), f);
    if (found.length) withImgs.push(f);
  }
  return withImgs;
}

(function main() {
  const categories = CATEGORIES_ENV.length ? CATEGORIES_ENV : detectTopFoldersWithImages();
  if (VERBOSE) console.log("Categories:", categories);

  const manifest = {};
  for (const cat of categories) {
    const abs = path.join(REPO_ROOT, cat);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      if (VERBOSE) console.warn("[warn] Missing folder:", cat);
      manifest[cat] = [];
      continue;
    }
    const imgs = walkImages(abs, cat).sort(natural);
    imgs.sort((a, b) => {
      const score = p => (/(\bcover\b|\bhero\b|^0{1,3}\d)/i.test(path.basename(p)) ? 0 : 1);
      const sa = score(a), sb = score(b);
      return sa === sb ? natural(a, b) : sa - sb;
    });
    if (VERBOSE) console.log(`[${cat}] ${imgs.length} images`);
    manifest[cat] = imgs;
  }

  const json = JSON.stringify(manifest, null, 2) + "\n";
  let changed = true;
  try { changed = fs.readFileSync(OUT_FILE, "utf8") !== json; } catch {}
  fs.writeFileSync(OUT_FILE, json, "utf8");
  console.log(`Wrote ${OUT_FILE}${changed ? "" : " (no changes)"}`);
})();
