#!/usr/bin/env node
// Removes build output, the store layout folders and zips, on any OS.
import { rmSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

for (const dir of ["build", "dist", ".deploy", "py_modules", "defaults"]) {
  rmSync(resolve(root, dir), { recursive: true, force: true });
}
for (const entry of readdirSync(root)) {
  if (entry.endsWith(".zip")) rmSync(resolve(root, entry), { force: true });
}
