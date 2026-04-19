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

const EXPECTED = [
  "about-page.png",
  "home.png",
  "home-shelves.png",
  "qam.png",
  "game-menu.png",
  "shelf-create.png",
  "shelf-import.png",
  "shelf-actions.png",
  "shelf-edit.png",
  "shelf-hidden.png",
  "shelf-delete.png",
  "shelf-export.png",
  "reset-all.png",
  "smart-shelves-qam.png",
  "smart-shelf-modal.png",
  "global-toggles.png",
];

// PNG magic bytes
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_SIZE = 10_000; // 10 KB minimum — anything smaller is likely broken

let errors = 0;

for (const name of EXPECTED) {
  const path = join(screenshotsDir, name);
  if (!existsSync(path)) {
    console.error(`MISSING  ${name}`);
    errors++;
    continue;
  }

  const stat = statSync(path);
  if (stat.size < MIN_SIZE) {
    console.error(`TOO SMALL  ${name} (${stat.size} bytes, min ${MIN_SIZE})`);
    errors++;
    continue;
  }

  const header = readFileSync(path, { length: 8 });
  const buf = Buffer.from(header.buffer, header.byteOffset, Math.min(header.length, 8));
  if (!buf.subarray(0, 8).equals(PNG_HEADER)) {
    console.error(`NOT PNG  ${name}`);
    errors++;
    continue;
  }

  console.log(`OK       ${name} (${(stat.size / 1024).toFixed(0)} KB)`);
}

if (errors > 0) {
  console.error(`\n${errors} screenshot(s) failed validation`);
  process.exit(1);
} else {
  console.log(`\nAll ${EXPECTED.length} screenshots valid`);
}
