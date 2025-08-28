// .github/scripts/generate-manifest.js
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const IMG_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic",
  ".JPG", ".JPEG", ".PNG", ".WEBP", ".GIF", ".AVIF", ".HEIC"
]);

// Recursively collect files under a dir
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // skip hidden/.git
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

// Build manifest: top-level folders become categories
function buildManifest() {
  const manifest = {};
  const top = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("."))
    .map(d => d.name);

  for (const dirName of top) {
    const absDir = path.join(ROOT, dirName);
    const files = walk(absDir)
      .filter(f => IMG_EXTS.has(path.extname(f)))
      .map(f => path.relative(ROOT, f).split(path.sep).join("/")); // posix paths

    if (files.length) {
      // Keep only files inside this category folder
      const rels = files
        .filter(f => f.startsWith(dirName + "/"))
        .sort((a, b) => a.localeCompare(b, "en"));

      if (rels.length) manifest[dirName] = rels;
    }
  }

  return manifest;
}

function writeIfChanged(file, data) {
  const next = JSON.stringify(data, null, 2) + "\n";
  if (fs.existsSync(file)) {
    const prev = fs.readFileSync(file, "utf8");
    if (prev === next) {
      console.log("manifest.json unchanged.");
      return false;
    }
  }
  fs.writeFileSync(file, next, "utf8");
  console.log("manifest.json updated.");
  return true;
}

(function main() {
  const manifest = buildManifest();
  const changed = writeIfChanged(path.join(ROOT, "manifest.json"), manifest);
  // Log counts per category for debugging
  for (const [k, v] of Object.entries(manifest)) {
    console.log(`${k}: ${v.length} image(s)`);
  }
  if (!Object.keys(manifest).length) {
    console.warn("No images found. Are they inside top-level folders (e.g. Events/, Fashion/)?");
  }
  process.exit(0);
})();
