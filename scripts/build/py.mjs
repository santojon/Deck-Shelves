#!/usr/bin/env node
// Cross-platform Python launcher. Resolves a Python 3 interpreter and runs it
// with the forwarded args, so pnpm scripts that call Python work natively on
// Windows (py -3 / python), macOS, SteamOS, and Linux (python3) — without
// requiring `python3` specifically to be on PATH.
//
// Windows order is `py -3` first (the reliable launcher) so we never hit the
// Microsoft Store `python3.exe` stub that pops the Store when Python is absent.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const candidates =
  process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];

for (const [bin, ...prefix] of candidates) {
  const res = spawnSync(bin, [...prefix, ...args], { stdio: "inherit" });
  // ENOENT → this interpreter isn't installed; try the next candidate.
  if (res.error && res.error.code === "ENOENT") continue;
  process.exit(res.status === null ? 1 : res.status);
}

console.error(
  "[py] No Python 3 interpreter found (tried: " +
    candidates.map((c) => c.join(" ")).join(", ") +
    "). Install Python 3.10+.",
);
process.exit(1);
