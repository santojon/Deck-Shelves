#!/usr/bin/env node
// Local deploy: install the built plugin into THIS machine's Decky Loader plugin
// dir — no SSH, no remote Deck. For developing directly on a Steam Deck / Linux
// box / Windows machine that ALREADY has Decky Loader installed.
//
// It does NOT install Decky. If Decky lives outside the default location
// (`~/homebrew`), point it with DECKY_PLUGINS_DIR (or DECKY_HOME).
//
// Usage:
//   pnpm run deploy:local          # build + copy into the local Decky plugin dir
//   pnpm run deploy:local:hard     # + reload plugin_loader and restart Steam (Linux)
//   pnpm run deploy:local -- --no-build   # skip the build (use existing dist/)
//   DECKY_PLUGINS_DIR=/custom/homebrew/plugins pnpm run deploy:local
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, rmSync, cpSync, copyFileSync,
  readFileSync, writeFileSync, readdirSync, statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "deck-shelves";
const HARD = process.argv.includes("--hard");
const NO_BUILD = process.argv.includes("--no-build");

loadEnv();

const pluginsDir = resolvePluginsDir();
const deckyHome = dirname(pluginsDir); // …/homebrew

// Assume Decky is installed — do not install it. The homebrew dir existing is
// our "Decky is here" proxy.
if (!existsSync(deckyHome)) {
  fail([
    `Decky Loader not found at ${deckyHome}.`,
    `This installs the plugin into an EXISTING Decky Loader — it does not install Decky.`,
    `If Decky is installed elsewhere, set DECKY_PLUGINS_DIR=/path/to/homebrew/plugins`,
    `(or DECKY_HOME=/path/to/homebrew) in your .env or environment, then re-run.`,
  ]);
}
mkdirSync(pluginsDir, { recursive: true });

// 1. Build (development) unless --no-build.
if (!NO_BUILD) {
  console.log("[deploy:local] Building plugin (development)…");
  const b = spawnSync("pnpm", ["run", "build"], {
    cwd: ROOT,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (b.status !== 0) fail(["build failed — fix the errors above and re-run."]);
}
if (!existsSync(join(ROOT, "dist", "index.js"))) {
  fail(["dist/index.js missing — run `pnpm run build` first (or drop --no-build)."]);
}

// 2. Stage the plugin payload fresh (mirrors the remote deploy's rsync --delete).
const dest = join(pluginsDir, SLUG);
try {
  rmSync(dest, { recursive: true, force: true });
} catch (e) {
  fail([
    `Could not clear ${dest}: ${e.message}`,
    `The Decky plugins dir may be root-owned — fix its ownership or run with the`,
    `right permissions (Decky sometimes owns ~/homebrew as root).`,
  ]);
}
mkdirSync(join(dest, "dist"), { recursive: true });

// plugin.json (+ dev `debug` flag), package.json, main.py + every root *.py.
const pluginJson = JSON.parse(readFileSync(join(ROOT, "plugin.json"), "utf8"));
pluginJson.flags = Array.isArray(pluginJson.flags) ? pluginJson.flags : [];
if (!pluginJson.flags.includes("debug")) pluginJson.flags.push("debug");
writeFileSync(join(dest, "plugin.json"), JSON.stringify(pluginJson, null, 2) + "\n");
copyFileSync(join(ROOT, "package.json"), join(dest, "package.json"));
for (const f of readdirSync(ROOT)) {
  if (f.endsWith(".py") && statSync(join(ROOT, f)).isFile()) {
    copyFileSync(join(ROOT, f), join(dest, f));
  }
}

// Frontend + optional asset trees.
cpSync(join(ROOT, "dist"), join(dest, "dist"), { recursive: true });
for (const d of ["assets", "i18n"]) {
  if (existsSync(join(ROOT, d))) cpSync(join(ROOT, d), join(dest, d), { recursive: true });
}

if (!existsSync(join(dest, "dist", "index.js"))) {
  console.warn("[deploy:local] WARN: dist/index.js missing after copy.");
}
console.log(`[deploy:local] Installed to ${dest}`);

// 3. Reload.
if (HARD) {
  reloadHard();
} else {
  console.log("[deploy:local] Reload from Decky (Developer → Reload deck-shelves) or restart Steam.");
}

// ── helpers ──────────────────────────────────────────────────────────────────
function reloadHard() {
  if (process.platform === "win32") {
    console.log("[deploy:local] --hard: on Windows, restart Decky + Steam manually (no standard service name).");
    return;
  }
  console.log("[deploy:local] --hard: restarting plugin_loader.service + Steam…");
  let restarted =
    spawnSync("sudo", ["-n", "systemctl", "restart", "plugin_loader.service"], { stdio: "inherit" }).status === 0;
  if (!restarted && process.env.DECK_SUDO_PASS) {
    restarted =
      spawnSync("bash", ["-c", `printf '%s\\n' "$DECK_SUDO_PASS" | sudo -S systemctl restart plugin_loader.service`],
        { stdio: "inherit", env: process.env }).status === 0;
  }
  if (!restarted) {
    console.log("[deploy:local] WARN: could not restart plugin_loader (no passwordless sudo / DECK_SUDO_PASS). Reload from the Decky UI instead.");
  }
  spawnSync("bash", ["-c", "killall steam 2>/dev/null || pkill steam 2>/dev/null || true"], { stdio: "inherit" });
}

function resolvePluginsDir() {
  if (process.env.DECKY_PLUGINS_DIR) return expand(process.env.DECKY_PLUGINS_DIR);
  const home = process.env.DECKY_HOME ? expand(process.env.DECKY_HOME) : join(homedir(), "homebrew");
  return join(home, "plugins");
}

function expand(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    /* no .env — fine */
  }
}

function fail(lines) {
  for (const l of lines) console.error(`[deploy:local] ${l}`);
  process.exit(1);
}
