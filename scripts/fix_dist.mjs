#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const file = path.join(root, "dist", "index.js");

if (!fs.existsSync(file)) process.exit(0);

let src = fs.readFileSync(file, "utf8");
let changed = false;

function exportCjs(sym) {
  changed = true;
  return `\n// Deck Shelves: patched for Decky loader (CJS export)\nmodule.exports = ${sym};\nmodule.exports.default = ${sym};\n`;
}

// Pattern: export { foo as default };
src = src.replace(/^\s*export\s*\{\s*([A-Za-z0-9_$]+)\s+as\s+default\s*\}\s*;?\s*$/m, (_m, sym) => exportCjs(sym));

// Pattern: export { foo as default, ... };
src = src.replace(/^\s*export\s*\{\s*([A-Za-z0-9_$]+)\s+as\s+default\s*,[^}]*\}\s*;?\s*$/m, (_m, sym) => exportCjs(sym));

// Remove any remaining top-level export lines (Decky runs dist as CJS)
if (/^\s*export\s+/m.test(src)) {
  src = src
    .split("\n")
    .filter((line) => !/^\s*export\s+/.test(line))
    .join("\n");
  changed = true;
}

// Fallback: if no module.exports set, export definePlugin symbol
if (!/module\.exports\s*=/.test(src)) {
  const m = src.match(/\b(var|const|let)\s+([A-Za-z0-9_$]+)\s*=\s*definePlugin\s*\(/);
  if (m) {
    src += exportCjs(m[2]);
  }
}

if (changed) fs.writeFileSync(file, src, "utf8");
