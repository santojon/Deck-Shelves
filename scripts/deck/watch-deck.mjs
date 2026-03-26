
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const hard = process.argv.includes("--hard");
const host = process.argv.filter((arg) => !arg.startsWith("--"))[2] || process.env.DECK_HOST || "steamdeck";
const roots = ["src", "i18n", "assets", "main.py", "plugin.json", "package.json", "vite.plugin.config.ts"];
const watchers = [];
let timer = null;
let running = false;
let queued = false;

function runDeploy() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  queued = false;
  const script = hard ? `pnpm run deploy:deck:hard ${host}` : `pnpm run deploy:deck ${host}`;
  try {
    execSync(script, { stdio: "inherit" });
  } finally {
    running = false;
    if (queued) schedule();
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => runDeploy(), 250);
}

function watch(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    watchers.push(fs.watch(target, { recursive: true }, schedule));
  } else {
    watchers.push(fs.watch(path.dirname(target), schedule));
  }
}

for (const target of roots) watch(target);
console.log(`[watch:deck] Watching local changes for ${host} (${hard ? "hard" : "soft"} mode)`);
runDeploy();

function cleanup() {
  watchers.forEach((watcher) => watcher.close());
  if (timer) clearTimeout(timer);
}
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
