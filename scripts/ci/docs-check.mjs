#!/usr/bin/env node
/* Keeps the user-facing docs honest against the code.
   Five families of check:
     1. Coverage  — every filter type, sort key, built-in source, smart-shelf
        mode and shelf template that the UI exposes is documented.
     2. Index     — docs/README.md lists every doc and all its links resolve.
     3. Diagrams  — no HTML entities in diagram labels, fences balanced.
     4. Icon      — the inlined DeckShelvesLogo matches assets/icon.svg.
     5. Badges    — the hard-coded test counts in README.md match reality.
     6. Shipped   — tracked docs and code carry no process or tool words.
   Badge checks collect the suites (fast: `vitest list` + `pytest --collect-only`);
   pass `--no-badges` to skip them. Exits non-zero on any failure. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(path.join(root, p), "utf8");
const failures = [];
const ok = [];

/* Slice out an `export const NAME … = [ … ]` literal by bracket matching, so a
   file holding several arrays (SORT_OPTIONS + V3_SOURCE_OPTIONS) is unambiguous. */
function arrayBlock(src, name) {
  const re = new RegExp(`(export\\s+)?const\\s+${name}\\b[^=]*=\\s*\\[`);
  const m = re.exec(src);
  if (!m) return "";
  // Start at the `[` that OPENS the literal — the last one in the match, since a
  // type annotation (`: FilterItemType[] =`) also contains brackets.
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

function enumBlock(src, name) {
  const m = new RegExp(`${name}\\s*=\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)`).exec(src);
  return m ? m[1] : "";
}

const quoted = (block) => [...block.matchAll(/["'](\w+)["']/g)].map((m) => m[1]);
const valueIds = (block) => [...block.matchAll(/value:\s*["']([\w_]+)["']/g)].map((m) => m[1]);

function checkCoverage(label, ids, docPath) {
  const unique = [...new Set(ids)];
  // A zero-length extraction means the source moved and the regex stopped
  // matching — fail loudly instead of reporting a hollow "0/0 documented".
  if (unique.length === 0) {
    failures.push(`${label}: extracted 0 ids — the extractor in docs-check.mjs needs updating`);
    return;
  }
  const doc = read(docPath);
  const missing = unique.filter((id) => !doc.includes(id));
  if (missing.length) failures.push(`${label}: ${missing.length} not documented in ${docPath} → ${missing.join(", ")}`);
  else ok.push(`${label}: ${unique.length}/${unique.length} documented in ${docPath}`);
}

// ---------------------------------------------------------------- 1. coverage
const filterUtils = read("src/components/filter/utils.tsx");
const editorConsts = read("src/components/qam/modals/editShelf/constants.ts");
const types = read("src/types.ts");
const templates = read("src/domain/templates.ts");

checkCoverage("Filter types", quoted(arrayBlock(filterUtils, "ALL_FILTER_TYPES")), "docs/filters.md");
checkCoverage("Sort keys", valueIds(arrayBlock(editorConsts, "SORT_OPTIONS")), "docs/filters.md");
checkCoverage("Built-in sources", valueIds(arrayBlock(editorConsts, "V3_SOURCE_OPTIONS")), "docs/filters.md");
checkCoverage("Smart-shelf modes", quoted(enumBlock(types, "SmartShelfModeSchema")), "docs/smart-shelves.md");
checkCoverage(
  "Shelf templates",
  [...templates.matchAll(/id:\s*["']([\w_]+)["']/g)].map((m) => m[1]),
  "docs/shelf-templates.md",
);

// ------------------------------------------------------------------- 2. index
const indexPath = "docs/README.md";
const index = read(indexPath);
const orphans = readdirSync(path.join(root, "docs"))
  .filter((f) => f.endsWith(".md") && f !== "README.md" && !index.includes(f));
if (orphans.length) failures.push(`Docs index: not listed in ${indexPath} → ${orphans.join(", ")}`);
else ok.push(`Docs index: every doc listed in ${indexPath}`);

const broken = [...index.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)]
  .map((m) => m[1])
  .filter((l) => !/^https?:/.test(l))
  .filter((l) => !existsSync(path.join(root, "docs", l)));
if (broken.length) failures.push(`Docs index: broken links → ${broken.join(", ")}`);
else ok.push("Docs index: all links resolve");

// ------------------------------------------------------------------ 3. diagrams
/* HTML entities inside a diagram label render literally (`&#64;deck-shelves`)
   wherever the renderer has HTML labels disabled — quote the label and use the
   real character instead. Also catches unbalanced ```mermaid fences. */
const docFiles = readdirSync(path.join(root, "docs")).filter((f) => f.endsWith(".md"));
let diagrams = 0;
for (const file of docFiles) {
  const body = read(`docs/${file}`);
  const fences = (body.match(/```mermaid\n/g) ?? []).length;
  const blocks = [...body.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length !== fences) {
    failures.push(`Diagrams: docs/${file} has an unclosed \`\`\`mermaid block`);
    continue;
  }
  diagrams += blocks.length;
  for (const [i, code] of blocks.entries()) {
    const ent = code.match(/&#\d+;|&[a-z]+;/g);
    if (ent) failures.push(`Diagrams: docs/${file} block ${i + 1} uses HTML entities (${[...new Set(ent)].join(", ")}) — quote the label and use the literal character`);
  }
}
if (!failures.some((f) => f.startsWith("Diagrams:"))) ok.push(`Diagrams: ${diagrams} block(s) clean (no HTML entities, fences balanced)`);

// ------------------------------------------------------------------ 4. icon sync
/* The plugin marks are inlined as JSX (not imported from their .svg, to avoid
   raw-HTML injection), so each can drift from its source file. Guard that every
   rect and a distinctive marker match across each source/component pair. */
const rectSet = (src) =>
  new Set([...src.matchAll(/x="(-?[\d.]+)"\s+y="(-?[\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/g)]
    .map((m) => `${m[1]},${m[2]},${m[3]},${m[4]}`));
const ICON_PAIRS = [
  { svg: "assets/icon.svg", tsx: "src/components/icons.tsx", marker: "translate(-340.6,-224.7) scale(0.76)", name: "DeckShelvesLogo", min: 10 },
  { svg: "assets/tab-icon.svg", tsx: "src/index.tsx", marker: "rotate(-13 15.95 19)", name: "DeckShelvesIcon", min: 3 },
];
for (const { svg, tsx, marker, name, min } of ICON_PAIRS) {
  const svgSrc = read(svg);
  const tsxSrc = read(tsx);
  const svgRects = rectSet(svgSrc);
  const missing = [...svgRects].filter((r) => !rectSet(tsxSrc).has(r));
  if (svgRects.size < min) failures.push(`Icon: extracted <${min} rects from ${svg} — the extractor needs updating`);
  else if (missing.length) failures.push(`Icon: ${name} is out of sync with ${svg} (missing rects: ${missing.join("  ")})`);
  else if (!svgSrc.includes(marker) || !tsxSrc.includes(marker)) failures.push(`Icon: the shared marker "${marker}" differs between ${svg} and ${name}`);
  else ok.push(`Icon: ${name} matches ${svg} (${svgRects.size} rects)`);
}

// ------------------------------------------------------------------ 5. badges
if (!process.argv.includes("--no-badges")) {
  const readme = read("README.md");
  const badge = (tool) => {
    const m = new RegExp(`${tool}-(\\d+)%20passed`).exec(readme);
    return m ? Number(m[1]) : null;
  };
  const run = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

  const counts = {};
  try {
    counts.vitest = run("npx vitest list").split("\n").filter((l) => l.includes(" > ")).length;
  } catch { /* collector unavailable */ }
  try {
    const out = run("python3 -m pytest src/test/ -q --collect-only");
    counts.pytest = Number(/(\d+) tests collected/.exec(out)?.[1] ?? NaN);
  } catch { /* collector unavailable */ }

  for (const tool of ["vitest", "pytest"]) {
    const claimed = badge(tool);
    const actual = counts[tool];
    if (claimed === null) failures.push(`Badge: no ${tool} count badge found in README.md`);
    else if (!Number.isFinite(actual)) ok.push(`Badge: ${tool} skipped (collector unavailable)`);
    else if (claimed !== actual) failures.push(`Badge: README says ${tool} ${claimed}, actual ${actual} — refresh the badge`);
    else ok.push(`Badge: ${tool} ${actual} matches README`);
  }
}

// ------------------------------------------------------------ 6. shipped text
// Patterns are assembled from pieces so this file never matches itself. The
// sibling host's name is allowed only on the install pages below; elsewhere it
// is refused in prose (link targets, file names and code spans are ignored) and
// in code comments (string literals are functional and ignored).
{
  const w = (...parts) => parts.join("");
  const siblingName = new RegExp(w("shelves", "hub"), "i");
  const siblingPages = new Set([
    "README.md", "docs/pt-BR/README.md",
    w("docs/decky-or-shelves", "hub.md"), w("docs/pt-BR/decky-or-shelves", "hub.md"),
    w("community-docs/shelves", "hub-install.md"), w("community-docs/pt-BR/shelves", "hub-install.md"),
    "community-docs/getting-started.md", "community-docs/pt-BR/getting-started.md",
  ]);
  const prose = (line) => line.replace(/\]\([^)]*\)/g, "]()").replace(/`[^`]*`/g, "").replace(/https?:\/\/\S+/g, "").replace(/\S+\.md\b/g, "");
  const comment = (line, hash) => {
    const s = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    const m = hash ? s.match(/#(.*)$/) : s.match(/(?:\/\/|\/\*|^\s*\*)(.*)$/);
    return m ? m[1] : "";
  };
  const processWords = new RegExp(`\\b(${w("spr", "int")}|${w("road", "map")})\\b|${w("cla", "ude")}|${w("anthr", "opic")}|${w("co-auth", "ored")}`, "i");
  const aiWords = new RegExp(`\\b(${w("A", "I")}|${w("I", "A")})\\b`);
  const internalPaths = new RegExp(`\\${w(".road", "maps")}\\b|\\${w(".cla", "ude")}/`);
  const tracked = (paths) => {
    try { return execSync(`git ls-files -- ${paths}`, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { return null; }
  };
  const docs = tracked("README.md CHANGELOG.md RELEASE_NOTES.md docs community-docs");
  const code = tracked("src scripts main.py");
  if (!docs || !code) ok.push("Shipped text: skipped (not a git checkout)");
  else {
    const hits = [];
    const scan = (file, patterns, nameIn) => {
      if (!existsSync(path.join(root, file))) return;
      read(file).split("\n").forEach((line, i) => {
        if (patterns.some((re) => re.test(line)) || (nameIn && siblingName.test(nameIn(line)))) hits.push(`${file}:${i + 1}`);
      });
    };
    for (const f of docs.filter((f) => f.endsWith(".md"))) scan(f, [processWords, aiWords, internalPaths], siblingPages.has(f) ? null : prose);
    for (const f of code.filter((f) => /\.(ts|tsx|js|mjs|cjs|py|sh)$/.test(f))) scan(f, [processWords, aiWords, internalPaths], (line) => comment(line, /\.(py|sh)$/.test(f)));
    if (hits.length) failures.push(`Shipped text: process or tool words in ${hits.length} line(s): ${hits.slice(0, 20).join(", ")}`);
    else ok.push(`Shipped text: ${docs.length + code.length} tracked files clean`);
  }
}

// ------------------------------------------------------------------- 7. report
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of failures) console.error(`  ❌ ${line}`);
if (failures.length) {
  console.error(`\ndocs-check: ${failures.length} problem(s). Document the new entries (or refresh the badge) and re-run.`);
  process.exit(1);
}
console.log(`\ndocs-check: all ${ok.length} checks passed.`);
