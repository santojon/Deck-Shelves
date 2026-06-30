import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const plugin = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
const errors = [];

const requiredScripts = ["build:plugin", "deck:setup", "deploy:deck", "watch:deck", "package"];
for (const name of requiredScripts) {
  if (!pkg.scripts?.[name]) errors.push(`Missing script: ${name}`);
}
if (plugin.name !== "Deck Shelves") errors.push("plugin.json name must remain 'Deck Shelves'.");
if (!Array.isArray(plugin.flags)) errors.push("plugin.json must have a 'flags' array field.");
for (const rel of [
  "src/index.tsx",
  "src/components/Shelf.tsx",
  "src/components/HomeInject.tsx",
  "src/runtime/homePatch.tsx",
  "src/components/DeckQAMSettings.tsx",
  "scripts/deploy/deck-setup.sh",
  "scripts/deploy/deploy-deck.sh",
  "scripts/deck/watch-deck.mjs",
]) {
  if (!fs.existsSync(path.join(root, rel))) errors.push(`Missing required file: ${rel}`);
}
if (fs.existsSync(path.join(root, "src/preview"))) errors.push("Preview web code should not exist in this deck-only project.");

// i18n is sliced into i18n/<locale>/<area>.json; the loader merges areas.
// Enforce no cross-area key collisions and identical key sets per locale.
const i18nDir = path.join(root, "i18n");
if (fs.existsSync(i18nDir)) {
  const mergedKeys = (loc) => {
    const keys = new Set();
    for (const f of fs.readdirSync(path.join(i18nDir, loc))) {
      if (!f.endsWith(".json")) continue;
      const obj = JSON.parse(fs.readFileSync(path.join(i18nDir, loc, f), "utf8"));
      for (const k of Object.keys(obj)) {
        if (keys.has(k)) errors.push(`i18n duplicate key "${k}" across areas in ${loc}`);
        keys.add(k);
      }
    }
    return keys;
  };
  const locales = fs.readdirSync(i18nDir).filter((d) => fs.statSync(path.join(i18nDir, d)).isDirectory());
  const base = mergedKeys("en-US");
  for (const loc of locales) {
    const k = mergedKeys(loc);
    const missing = [...base].filter((x) => !k.has(x));
    const extra = [...k].filter((x) => !base.has(x));
    if (missing.length) errors.push(`i18n ${loc} missing ${missing.length} keys (e.g. ${missing.slice(0, 3).join(", ")})`);
    if (extra.length) errors.push(`i18n ${loc} has ${extra.length} extra keys (e.g. ${extra.slice(0, 3).join(", ")})`);
  }
}

if (errors.length) {
  console.error(`Validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Validation passed.");
