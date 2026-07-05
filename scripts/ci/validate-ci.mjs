#!/usr/bin/env node
// CI validation (no device): typecheck → build → tests → package → verify →
// compat. Routes release-tag runs to reports/release/, otherwise reports/ci/.
// Cross-OS Node port of validate-ci.sh. Usage: `pnpm validate:ci`.
import { join } from "node:path";
import { rmSync } from "node:fs";
import { Harness, ROOT, pnpm, py, q, timestamp } from "./lib/harness.mjs";

let scope = process.env.REPORT_SCOPE || "ci";
if (!process.env.REPORT_SCOPE && (process.env.GITHUB_REF || "").startsWith("refs/tags/v")) {
  scope = "release";
}

const ts = timestamp();
const reportDir = join(ROOT, "site", "reports", scope);
const tmp = join(reportDir, `.tmp_${ts}`);
const h = new Harness(tmp);

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  h.report({ ts, stress: 0, subdir: scope, reportDir });
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}
process.on("exit", finish);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { finish(); process.exit(1); });
}

h.step("typecheck", "TypeScript typecheck", pnpm("typecheck"));
h.buildOk = h.step("build", "Build (production)", pnpm("build:release"));
h.step("tests", "Unit tests (vitest)", pnpm("test"));
h.step("package", "Package (.zip)", py(q(join(ROOT, "scripts", "build", "package.py"))));
h.step("verify", "Verify package", py(q(join(ROOT, "scripts", "build", "verify-package.py"))));
h.step("compat", "Compat validation", pnpm("validate:compat"));

const ok = h.summarize();
process.exitCode = ok ? 0 : 1;
