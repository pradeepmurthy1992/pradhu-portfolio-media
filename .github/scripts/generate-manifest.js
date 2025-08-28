const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const OUT_FILE = path.join(REPO_ROOT, "manifest.json");

// Allow-list of extensions (lowercased). Add more if needed.
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);

const IGNORE_DIRS = new Set([".git", ".github", ".gitlab", ".vscode", "node_modules"]);
const VERBOSE = (process.env.VERBOSE || "1") !== "0";

// If CATEGORIES is set, we’ll use only those. Otherwise auto-detect top-level folders with images.
const CATEGORIES_ENV = (process.env.CATEGORIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function walkImages(rootDir, relFromRoot = "") {
  let out = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith(".") || name.startsWith("_")) continue;
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      const full = path.join(rootDir, name);
      const rel = path.posix.join(relFromRoot, name.replaceAll("\\", "/"));
      out = out.concat(walkImages(full, rel));
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (!IMG_EXTS.has(ext)) continue;
      const rel = path.posix.join(relFromRoot, name.replaceAll("\\", "/"));
      if (rel === "manifest.json") continue;
      out.push(rel);
    }
  }
  return out;
}

function detectTopLevelFoldersWithImages() {
  const folders = fs.readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(naturalCompare);

  const withImages = [];
  for (const f of folders) {
    const abs = path.join(REPO_ROOT, f);
    const found = walkImages(abs, f);
    if (found.length > 0) withImages.push(f);
  }
  return withImages;
}

(function main() {
  let categories = CATEGORIES_ENV;
  if (categories.length === 0) {
    categories = detectTopLevelFoldersWithImages();
    if (VERBOSE) console.log("Auto-detected categories:", categories);
  } else if (VERBOSE) {
    console.log("Using CATEGORIES from env:", categories);
  }

  const manifest = {};
  for (const cat of categories) {
    const abs = path.join(REPO_ROOT, cat);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      if (VERBOSE) console.warn(`[warn] Category folder missing: ${cat}`);
      manifest[cat] = [];
      continue;
    }
    const images = walkImages(abs, cat).sort(naturalCompare);

    // Prefer cover-like names first
    images.sort((a, b) => {
      const score = (p) => (/(\bcover\b|\bhero\b|^0{1,3}\d)/i.test(path.basename(p)) ? 0 : 1);
      const sa = score(a), sb = score(b);
      return sa === sb ? naturalCompare(a, b) : sa - sb;
    });

    if (VERBOSE) {
      console.log(`[${cat}] found ${images.length} images`);
      console.log(images.slice(0, 10).map((p) => `  - ${p}`).join("\n") + (images.length > 10 ? "\n  ..." : ""));
    }

    manifest[cat] = images;
  }

  const json = JSON.stringify(manifest, null, 2) + "\n";
  let changed = true;
  try { changed = fs.readFileSync(OUT_FILE, "utf8") !== json; } catch {}
  fs.writeFileSync(OUT_FILE, json, "utf8");
  console.log(`Wrote ${OUT_FILE}${changed ? "" : " (no changes)"}`);

  // If some categories ended up empty, hint why
  const empties = Object.entries(manifest).filter(([_, arr]) => arr.length === 0).map(([k]) => k);
  if (empties.length && VERBOSE) {
    console.warn(`[hint] Empty categories: ${empties.join(", ")}. Check folder names/case and extensions.`);
  }
})();
