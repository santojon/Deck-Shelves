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

if (errors.length) {
  console.error(`Validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Validation passed.");
