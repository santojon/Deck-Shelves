#!/usr/bin/env node
/**
 * Cross-platform wrapper for the bash compatibility checks under
 * `checks/`. The check scripts themselves are bash (each one sources a
 * `run_checks()` function), so this wrapper:
 *   1. Locates `bash` in PATH (Linux / macOS native, Windows via Git Bash
 *      or WSL).
 *   2. If found, runs `bash scripts/build/validate-compat.sh` (preserves
 *      the legacy entry point so CI keeps working).
 *   3. If not found, emits a friendly error explaining the requirement.
 *
 * Future port path: each `checks/**\/*.sh` becomes a `.mjs` companion
 * exporting a `runChecks(rootDir)` function. This wrapper would then
 * dispatch to the JS implementation when available, falling back to
 * bash otherwise. For now the bash scripts remain the source of truth.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const BASH_SCRIPT = path.join(ROOT, "scripts", "build", "validate-compat.sh");

if (!existsSync(BASH_SCRIPT)) {
  console.error(`validate-compat.sh not found at ${BASH_SCRIPT}`);
  process.exit(1);
}

function which(cmd) {
  const probe = process.platform === "win32"
    ? spawnSync("where", [cmd], { encoding: "utf8" })
    : spawnSync("command", ["-v", cmd], { encoding: "utf8", shell: "/bin/sh" });
  return probe.status === 0 && (probe.stdout || "").trim().length > 0;
}

if (!which("bash")) {
  console.error("");
  console.error("  ✗ bash is required to run the compatibility checks.");
  console.error("");
  console.error("  Install one of the following:");
  console.error("    macOS / Linux: bash ships by default.");
  console.error("    Windows:       install Git for Windows (provides Git Bash)");
  console.error("                   OR enable WSL (https://aka.ms/wsl).");
  console.error("");
  console.error("  Alternative: run the OS-independent subset via `pnpm run dev:check`");
  console.error("  (typecheck + lint + tests; skips bash-only integration checks).");
  console.error("");
  process.exit(2);
}

const result = spawnSync("bash", [BASH_SCRIPT, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: ROOT,
});
process.exit(result.status ?? 1);
