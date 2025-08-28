
/**
 * generate-manifest.js
 * -----------------------------------------------------------
 * Scans the repo for images and writes a root-level manifest.json:
 * {
 *   "Events": ["Events/file1.jpg", "Events/sub/f2.webp", ...],
 *   "Fashion": ["Fashion/look1.jpg", ...]
 * }
 *
 * - Keys are top-level folders (or limited by CATEGORIES env).
 * - Paths are POSIX-style and relative to repo root.
 * - Only image extensions are included.
 * - Hidden/system folders/files are ignored.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const OUT_FILE = path.join(REPO_ROOT, "manifest.json");
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

const IGNORE_DIRS = new Set([
  ".git",
  ".github",
  ".gitlab",
  ".vscode",
  "node_modules",
]);

const CATEGORIES_ENV = (process.env.CATEGORIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Natural-ish sort so 2 comes before 10 */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Recursively walk rootDir, return relative POSIX paths for images */
function walkImages(rootDir, relFromRoot = "") {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    // ignore hidden files/dirs and common junk
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("_")) continue;

    const full = path.join(rootDir, entry.name);
    const rel = path.posix.join(relFromRoot, entry.name.replaceAll("\\", "/"));

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkImages(full, rel));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMG_EXTS.has(ext)) continue;
      // skip this script and output if ever placed oddly
      if (rel === "manifest.json") continue;
      out.push(rel);
    }
  }
  return out;
}

/** Detect usable top-level categories (dirs in root) */
function detectTopLevelFolders() {
  const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(naturalCompare);
}

/** Main */
(function main() {
  const categories = CATEGORIES_ENV.length ? CATEGORIES_ENV : detectTopLevelFolders();

  const manifest = {};
  for (const cat of categories) {
    const abs = path.join(REPO_ROOT, cat);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      // category folder missing -> keep empty array for consistency
      manifest[cat] = [];
      continue;
    }
    const images = walkImages(abs, cat).sort(naturalCompare);
    // Optional: move cover-ish names to the top (cover, hero, 000, 001)
    images.sort((a, b) => {
      const score = (p) =>
        (/(\bcover\b|\bhero\b|^0{1,3}\d)/i.test(path.basename(p)) ? 0 : 1);
      const sa = score(a), sb = score(b);
      return sa === sb ? naturalCompare(a, b) : sa - sb;
    });
    manifest[cat] = images;
  }

  const json = JSON.stringify(manifest, null, 2) + "\n";

  // Write only if changed to keep history clean
  let changed = true;
  try {
    const prev = fs.readFileSync(OUT_FILE, "utf8");
    changed = prev !== json;
  } catch (_) {
    // file missing -> definitely changed
    changed = true;
  }

  fs.writeFileSync(OUT_FILE, json, "utf8");
  console.log(`Wrote ${OUT_FILE}${changed ? "" : " (no changes)"}`);
})();
