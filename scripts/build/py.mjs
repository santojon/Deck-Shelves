#!/usr/bin/env node
// Runs Python 3 with the forwarded args on any OS. On Windows `py -3` goes first, so the
// Microsoft Store `python3.exe` stub is never hit.
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
    "). Install Python 3.10+ (tooling; the plugin backend itself runs on 3.9+).",
);
process.exit(1);
