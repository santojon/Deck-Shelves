#!/usr/bin/env node
/**
 * Validate that all expected screenshots exist under assets/screenshots/
 * and are valid PNG files with a minimum size.
 *
 * Usage:
 *   node scripts/build/validate-screenshots.mjs
 *
 * Exit codes:
 *   0 — all screenshots valid
 *   1 — one or more screenshots missing or invalid
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const screenshotsDir = join(root, "assets", "screenshots");

// Expected screenshots — each entry lists the filename plus optional
// min/max size and dimension hints. `maxSize` catches wrong-surface
// captures: QAM popup PNGs at 522×741 compress to ~70-150 KB; a Big
// Picture capture at 1281×801 is 300 KB–2.5 MB, well above the popup
// range. A QAM popup shot that clocks in at 800 KB is almost certainly
// a BP capture that was substituted for the real popup.
const EXPECTED = [
  { file: "about-page.png", minSize: 50_000 },
  { file: "home.png" },
  { file: "home-shelves.png" },
  { file: "qam.png", surface: "qam-popup" },
  { file: "game-menu.png" },
  { file: "shelf-create.png" },
  { file: "shelf-import.png" },
  { file: "shelf-actions.png" },
  { file: "shelf-edit.png" },
  { file: "shelf-edit-filters.png" },
  { file: "shelf-edit-visual.png" },
  { file: "shelf-hidden.png", surface: "qam-popup" },
  { file: "shelf-delete.png" },
  { file: "shelf-export.png" },
  { file: "reset-all.png" },
  { file: "smart-shelves-qam.png", surface: "qam-popup" },
  { file: "smart-shelf-modal.png" },
  { file: "smart-shelf-edit.png" },
  { file: "global-toggles.png", surface: "qam-popup" },
];

// Optional screenshots — validated when present but not required. Saved
// Filters depends on user state (no filters saved → section hidden → no
// screenshot possible).
const OPTIONAL = [
  { file: "saved-filters-qam.png", surface: "qam-popup" },
];

// Surface profiles — per-surface size bounds and expected dimensions.
//
// QAM popup PNGs (522×741) span a wide compression range: a panel with
// sparse content on the dark theme background can land at ~38-40 KB, while
// a fully-populated section sits at 90-150 KB. The dimension check is the
// real "right surface" signal; `minSize` only catches truly-empty PNGs
// (compressed dark uniform fill, well under 20 KB). Keep this in sync with
// `QAM_CAPTURE_BLANK_THRESHOLD` in
// `scripts/devtools/deck/screenshots/screenshot.py`.
const SURFACES = {
  "qam-popup":   { minSize: 20_000,  maxSize: 250_000,   width: 522,  height: 741 },
  "big-picture": { minSize: 60_000,  maxSize: 3_000_000, width: 1281, height: 801 },
};

// PNG magic bytes
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// 60 KB matches QAM_CAPTURE_MIN_BYTES in the capture script — mostly-empty
// popup frames (compositor hasn't pushed, dark screen) compress down to
// ~39 KB at 522x741, well below this bar.
const MIN_SIZE = 60_000;

let errors = 0;

// Extract width/height from a PNG's IHDR chunk (bytes 16-23 after the
// 8-byte magic + "IHDR" marker). PNG is big-endian 32-bit ints.
function readPngDimensions(path) {
  const buf = readFileSync(path);
  if (buf.length < 24) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { width: w, height: h };
}

function validate(entry, { required }) {
  const { file, minSize, maxSize, surface } = entry;
  const profile = surface ? SURFACES[surface] : SURFACES["big-picture"];
  const floor = minSize ?? profile.minSize ?? MIN_SIZE;
  const ceiling = maxSize ?? profile.maxSize;

  const path = join(screenshotsDir, file);
  if (!existsSync(path)) {
    if (required) {
      console.error(`MISSING  ${file}`);
      errors++;
    } else {
      console.log(`SKIP     ${file} (optional, not present)`);
    }
    return;
  }

  const stat = statSync(path);
  if (stat.size < floor) {
    console.error(`TOO SMALL  ${file} (${stat.size} bytes, min ${floor})`);
    errors++;
    return;
  }
  if (ceiling && stat.size > ceiling) {
    console.error(`WRONG SURFACE  ${file} (${(stat.size / 1024).toFixed(0)} KB > ${(ceiling / 1024).toFixed(0)} KB — expected ${surface ?? "big-picture"} capture)`);
    errors++;
    return;
  }

  const header = readFileSync(path, { length: 8 });
  const hbuf = Buffer.from(header.buffer, header.byteOffset, Math.min(header.length, 8));
  if (!hbuf.subarray(0, 8).equals(PNG_HEADER)) {
    console.error(`NOT PNG  ${file}`);
    errors++;
    return;
  }

  if (profile.width && profile.height) {
    const dim = readPngDimensions(path);
    if (dim && (dim.width !== profile.width || dim.height !== profile.height)) {
      console.error(`WRONG DIMENSIONS  ${file} (${dim.width}x${dim.height}, expected ${profile.width}x${profile.height} for ${surface ?? "big-picture"})`);
      errors++;
      return;
    }
  }

  console.log(`OK       ${file} (${(stat.size / 1024).toFixed(0)} KB)`);
}

for (const entry of EXPECTED) validate(entry, { required: true });
for (const entry of OPTIONAL) validate(entry, { required: false });

if (errors > 0) {
  console.error(`\n${errors} screenshot(s) failed validation`);
  console.error("\nResolution hints:");
  console.error("  MISSING          → capture is absent. Rerun `python3 scripts/devtools/deck/screenshots/screenshot.py`.");
  console.error("  TOO SMALL        → QAM popup frame is blank (compositor not ready). Rerun; the capture script retries on blanks.");
  console.error("  WRONG SURFACE    → a Big Picture screenshot was saved for a file expected to be a QAM popup capture. Rerun with the current script.");
  console.error("  WRONG DIMENSIONS → the PNG dims don't match the surface. Inspect the file; the surface profile may have drifted.");
  process.exit(1);
} else {
  const required = EXPECTED.length;
  const optionalPresent = OPTIONAL.filter(e => existsSync(join(screenshotsDir, e.file))).length;
  const total = required + optionalPresent;
  console.log(`\nAll ${required} required screenshots valid (${total} total — ${optionalPresent}/${OPTIONAL.length} optional present)`);
}
