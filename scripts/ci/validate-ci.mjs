#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const py = (...args) => ["node", ["scripts/build/py.mjs", ...args]];
const pnpm = (script) => ["pnpm", ["run", script]];

const steps = [
  ["typecheck", ...pnpm("typecheck")],
  ["lint", ...pnpm("lint")],
  ["build", ...pnpm("build:release")],
  ["tests", ...pnpm("test")],
  ["pytest", ...py("-m", "pytest", "src/test", "-q")],
  ["package", ...py("scripts/build/package.py")],
  ["verify", ...py("scripts/build/verify-package.py")],
  ["compat", ...pnpm("validate:compat")],
];

for (const [name, cmd, args] of steps) {
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n${name} failed`);
    process.exit(r.status || 1);
  }
}
