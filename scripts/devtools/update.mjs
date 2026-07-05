#!/usr/bin/env node
// Dependency upgrade flow. Modes: check | pnpm | safe | major | verify | all.
// Cross-OS Node port of update.sh (runs on Windows, macOS, SteamOS, Linux).
// Non-interactive (CI / piped) or `--yes` / `YES=1` skips every confirmation.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = { blue: "\x1b[34m", green: "\x1b[32m", amber: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };
const blue = (m) => console.log(`${C.blue}▶${C.reset} ${m}`);
const green = (m) => console.log(`${C.green}✓${C.reset} ${m}`);
const amber = (m) => console.log(`${C.amber}⚠${C.reset} ${m}`);
const red = (m) => console.error(`${C.red}✗${C.reset} ${m}`);

const AUTO_YES = process.env.YES === "1" || process.argv.includes("--yes");

function run(command) {
  const r = spawnSync(command, { cwd: ROOT, shell: true, stdio: "inherit" });
  return !r.error && r.status === 0;
}
function has(bin) {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [bin], { stdio: "ignore" }).status === 0;
}
async function confirm(question) {
  if (!process.stdin.isTTY || AUTO_YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y$/i.test(ans.trim());
}
function pnpmVersion() {
  const r = spawnSync("pnpm", ["-v"], { shell: process.platform === "win32", encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function cmdCheck() {
  blue("Checking outdated dependencies (semver-safe + major candidates)…");
  run("pnpm outdated"); // returns non-zero when stale; ignore for the check pass
}

async function cmdPnpm() {
  blue(`Current pnpm: ${pnpmVersion()}`);
  if (has("corepack")) {
    blue("Upgrading pnpm via corepack…");
    run("corepack use pnpm@latest");
  } else {
    amber("corepack not available — falling back to npm install -g pnpm@latest");
    if (!(await confirm("Install latest pnpm globally via npm?"))) {
      amber("Skipped pnpm upgrade");
      return;
    }
    run("npm install -g pnpm@latest");
  }
  const next = pnpmVersion();
  green(`pnpm now at: ${next}`);

  // Sync the packageManager pin so contributors get the same version.
  const pkgPath = join(ROOT, "package.json");
  if (next !== "unknown" && existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.packageManager) {
      blue("Updating packageManager pin in package.json…");
      pkg.packageManager = `pnpm@${next}`;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      green(`packageManager pinned to pnpm@${next}`);
    }
  }
}

function cmdSafe() {
  blue("Applying semver-safe updates (no major bumps)…");
  run("pnpm update");
  run("pnpm install");
  green("Safe update done");
}

async function cmdMajor() {
  blue("Applying major updates (may include breaking changes)…");
  if (!(await confirm("This will move dependencies to their latest major versions. Continue?"))) {
    amber("Skipped major update");
    return;
  }
  run("pnpm update --latest");
  run("pnpm install");
  green("Major update done");
}

function cmdVerify() {
  blue("Running typecheck…");
  run("pnpm run typecheck");
  blue("Running tests…");
  run("pnpm test --run");
  blue("Running production build…");
  run("pnpm run build:release");
  green("Verification passed");
}

async function cmdAll() {
  cmdCheck();
  console.log();
  if (await confirm("Upgrade pnpm itself before updating packages?")) await cmdPnpm();
  else amber("Skipped pnpm upgrade");
  console.log();
  cmdSafe();
  console.log();
  if (await confirm("Run major-version updates too?")) await cmdMajor();
  else amber("Skipped major bumps (re-run with `major` to apply later)");
  console.log();
  cmdVerify();
}

const HELP = `Usage: node scripts/devtools/update.mjs <mode>

Modes:
  check      List outdated dependencies (read-only).
  pnpm       Upgrade pnpm itself + sync the package.json pin.
  safe       Apply semver-safe updates (no major bumps).
  major      Apply latest updates including majors (asks first).
  verify     typecheck + test + build (sanity check post-update).
  all        Run check, optionally upgrade pnpm, apply safe updates,
             optionally apply majors, then verify.

Flags / env:
  --yes / YES=1   Skip every confirmation prompt (CI-friendly).`;

const mode = process.argv.slice(2).find((a) => !a.startsWith("-")) || "help";
switch (mode) {
  case "check": cmdCheck(); break;
  case "pnpm": await cmdPnpm(); break;
  case "safe": cmdSafe(); break;
  case "major": await cmdMajor(); break;
  case "verify": cmdVerify(); break;
  case "all": await cmdAll(); break;
  case "help": case "-h": case "--help": console.log(HELP); break;
  default: red(`Unknown mode: ${mode}`); process.exit(2);
}
