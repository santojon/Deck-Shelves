#!/usr/bin/env node
// Cross-platform clean: remove build artifacts + pack/zip outputs.
// Replaces `rm -rf build dist .deploy build/package *.zip`, which does not
// exist on Windows cmd/PowerShell, so `pnpm run clean` works natively on
// Windows, macOS, and Linux (`build/package` is covered by removing `build`).
import { rmSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

for (const dir of ["build", "dist", ".deploy"]) {
  rmSync(resolve(root, dir), { recursive: true, force: true });
}
for (const entry of readdirSync(root)) {
  if (entry.endsWith(".zip")) rmSync(resolve(root, entry), { force: true });
}
