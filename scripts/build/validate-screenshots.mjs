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

// Optional screenshots — validated when present but not required. These
// depend on user state (e.g. "Saved Filters" disappears from the QAM
// when the list is empty) or on optional scenarios produced by the
// modular runner.
const OPTIONAL = [
  { file: "saved-filters-qam.png", surface: "qam-popup" },
  { file: "home-hero.png" },
  { file: "home-hide-recents.png" },
  { file: "import-overflow.png", surface: "qam-popup" },
  { file: "about-filters.png" },
  { file: "about-smart.png" },
  { file: "about-support.png" },
];

// Surface profiles — per-surface size bounds and an aspect-ratio window
// (width / height) instead of raw dimensions. Steam BP and the QAM popup
// can both shift surface size between releases (window chrome reshuffle,
// DPR change, layout tweak); raw-dim allowlists drift constantly and
// invalidate fresh captures whenever Steam ships an update. The aspect
// window survives DPR scaling and minor viewport changes while still
// catching the real failure mode this check exists to prevent: a QAM
// popup capture (always portrait) accidentally getting saved into a
// Big Picture slot (always landscape), or vice-versa. The two ranges
// don't overlap, so a misfile-d capture flips clearly to the wrong bucket.
//
// `minWidth` filters out tiny / cropped captures that happen to land in
// the right aspect range by accident.
//
// QAM popup PNGs span a wide compression range: a panel with sparse
// content on the dark theme background can land at ~38-40 KB, while a
// fully-populated section sits at 90-150 KB. `minSize` catches truly-
// empty PNGs (compressed dark uniform fill, well under 20 KB). Keep in
// sync with `QAM_CAPTURE_BLANK_THRESHOLD` in
// `scripts/devtools/deck/screenshots/screenshot.py`.
const SURFACES = {
  "qam-popup": {
    minSize: 20_000,
    maxSize: 250_000,
    aspectRange: [0.30, 0.85],  // portrait: 522×741 → 0.704 ; 597×1377 → 0.434
    minWidth: 400,
  },
  "big-picture": {
    minSize: 60_000,
    // Bumped from 3 MB to 5 MB — high-DPR captures of image-heavy home
    // views push individual PNGs past 4 MB.
    maxSize: 5_000_000,
    aspectRange: [1.40, 2.00],  // landscape: 1281×801 → 1.599 ; 2562×1442 → 1.777
    minWidth: 1000,
  },
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

  if (Array.isArray(profile.aspectRange) && profile.aspectRange.length === 2) {
    const dim = readPngDimensions(path);
    if (!dim || dim.width <= 0 || dim.height <= 0) {
      console.error(`UNREADABLE  ${file} (PNG header missing IHDR dims)`);
      errors++;
      return;
    }
    if (profile.minWidth && dim.width < profile.minWidth) {
      console.error(`TOO NARROW  ${file} (${dim.width}px wide, min ${profile.minWidth}px for ${surface ?? "big-picture"})`);
      errors++;
      return;
    }
    const aspect = dim.width / dim.height;
    const [minA, maxA] = profile.aspectRange;
    if (aspect < minA || aspect > maxA) {
      console.error(`WRONG ASPECT  ${file} (${dim.width}x${dim.height} ratio ${aspect.toFixed(3)}, expected ${minA.toFixed(2)}–${maxA.toFixed(2)} for ${surface ?? "big-picture"})`);
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
  console.error("  WRONG ASPECT     → the PNG ratio is outside the expected window for this surface (BP=landscape, QAM=portrait). Likely the file was saved into the wrong slot.");
  console.error("  TOO NARROW       → the capture is below the minimum width for this surface (cropped, scaled, or wrong context).");
  console.error("  UNREADABLE       → the PNG IHDR chunk is missing or malformed.");
  process.exit(1);
} else {
  const required = EXPECTED.length;
  const optionalPresent = OPTIONAL.filter(e => existsSync(join(screenshotsDir, e.file))).length;
  const total = required + optionalPresent;
  console.log(`\nAll ${required} required screenshots valid (${total} total — ${optionalPresent}/${OPTIONAL.length} optional present)`);
}
