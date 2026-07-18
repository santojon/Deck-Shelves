#!/usr/bin/env node
// Decoupling DEBT for the CI reports: how many call sites import the external
// UI/API libs (@decky/*) DIRECTLY instead of going through the sanctioned
// isolation layer (runtime/host/*, shims/*, the index.tsx bootstrap, tests).
// `leaks` is the trackable trend — LOWER is better; it drops as each direct
// import is routed through the single host-adapter seam. `adapter` counts files
// that import via runtime/host/decky (the seam), and `ratio` = leaks / (leaks +
// adapter) as a %.
//
// Usage: node decoupling-metric.mjs [srcDir]   (srcDir defaults to ./src)
// Emits one JSON line: { leaks, adapter, ratio, top: [{file,line,spec}] }
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const srcDir = process.argv[2] || join(root, 'src');

// The only places allowed to touch @decky directly (the isolation boundary).
function isSanctioned(rel) {
  return rel.includes(`${sep}shims${sep}`)
    || rel.includes(`${sep}host${sep}`)
    || rel.endsWith(`${sep}index.tsx`)
    || rel.includes(`${sep}test${sep}`);
}

function* walk(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (name !== 'node_modules') yield* walk(p); }
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

const DECKY_FROM = /\bfrom\s+['"]@decky\/([^'"]+)['"]/;
// Match the decky host adapter by module name so same-dir relative imports
// from inside src/runtime (`./host/decky`) count too, not just the deeper
// `../runtime/host/decky` form used elsewhere.
const ADAPTER_FROM = /\bfrom\s+['"][^'"]*host\/decky['"]/;

let leaks = 0;
let adapter = 0;
const top = [];
for (const file of walk(srcDir)) {
  const rel = relative(root, file);
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (ADAPTER_FROM.test(text)) adapter++;
  if (isSanctioned(rel)) continue;
  text.split('\n').forEach((line, i) => {
    const m = DECKY_FROM.exec(line);
    if (m) {
      leaks++;
      if (top.length < 25) top.push({ file: rel, line: i + 1, spec: `@decky/${m[1]}` });
    }
  });
}

const denom = adapter + leaks;
const ratio = denom > 0 ? Math.round((leaks / denom) * 1000) / 10 : 0;
process.stdout.write(JSON.stringify({ leaks, adapter, ratio, top }));
