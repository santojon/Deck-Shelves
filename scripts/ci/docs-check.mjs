#!/usr/bin/env node
/* Keeps the user-facing docs honest against the code.
   Five families of check:
     1. Coverage  — every filter type, sort key, built-in source, smart-shelf
        mode and shelf template that the UI exposes is documented.
     2. Index     — docs/README.md lists every doc and all its links resolve.
     3. Diagrams  — no HTML entities in diagram labels, fences balanced.
     4. Icon      — the inlined DeckShelvesLogo matches assets/icon.svg.
     5. Badges    — the hard-coded test counts in README.md match reality.
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
/* The DeckShelvesLogo mark is inlined as JSX in icons.tsx (not imported from the
   .svg, to avoid raw-HTML injection), so it can drift from assets/icon.svg.
   Guard that every book/shelf rect and the fit transform match across the two. */
const rectSet = (src) =>
  new Set([...src.matchAll(/x="(-?\d+)"\s+y="(-?\d+)"\s+width="(\d+)"\s+height="(\d+)"/g)]
    .map((m) => `${m[1]},${m[2]},${m[3]},${m[4]}`));
const iconSvg = read("assets/icon.svg");
const iconsTsx = read("src/components/icons.tsx");
const iconRects = rectSet(iconSvg);
const tsxRects = rectSet(iconsTsx);
const FIT = "translate(-340.6,-224.7) scale(0.76)";
const missingRects = [...iconRects].filter((r) => !tsxRects.has(r));
if (iconRects.size < 10) failures.push("Icon: extracted <10 rects from assets/icon.svg — the extractor needs updating");
else if (missingRects.length) failures.push(`Icon: DeckShelvesLogo is out of sync with assets/icon.svg (missing rects: ${missingRects.join("  ")})`);
else if (!iconSvg.includes(FIT) || !iconsTsx.includes(FIT)) failures.push("Icon: the fit transform differs between assets/icon.svg and DeckShelvesLogo");
else ok.push(`Icon: DeckShelvesLogo matches assets/icon.svg (${iconRects.size} rects + fit transform)`);

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

// ------------------------------------------------------------------- 6. report
for (const line of ok) console.log(`  ✅ ${line}`);
for (const line of failures) console.error(`  ❌ ${line}`);
if (failures.length) {
  console.error(`\ndocs-check: ${failures.length} problem(s). Document the new entries (or refresh the badge) and re-run.`);
  process.exit(1);
}
console.log(`\ndocs-check: all ${ok.length} checks passed.`);
