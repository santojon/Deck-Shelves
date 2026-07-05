#!/usr/bin/env node
// Full QA harness: typecheck → lint → i18n → build → vitest → pytest → package →
// verify → compat → device availability → deploy → uitests → perf.
// Device steps are skipped when the build fails or the Deck is unreachable.
// Cross-OS Node port of validate.sh. Usage: `pnpm qa` / `pnpm validate:full`
// (add `--stress`).
import { join } from "node:path";
import { rmSync } from "node:fs";
import { C, Harness, ROOT, loadEnv, pnpm, py, q, sleepMs, timestamp } from "./lib/harness.mjs";

const stress = process.argv.includes("--stress");
loadEnv(ROOT);

const ts = timestamp();
const reportDir = join(ROOT, "site", "reports", "local");
const tmp = join(reportDir, `.tmp_${ts}`);
const h = new Harness(tmp);

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  h.report({ ts, stress: stress ? 1 : 0, subdir: "local", reportDir });
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}
process.on("exit", finish);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { finish(); process.exit(1); });
}

// ── 1. Static + build + tests ────────────────────────────────────────────────
h.step("typecheck", "TypeScript typecheck", pnpm("typecheck"));
h.step("lint", "Lint (eslint + ruff)", pnpm("lint"));
h.step("i18n", "i18n key validation", `node ${q(join(ROOT, "scripts", "build", "validate.mjs"))}`);
h.buildOk = h.step("build", "Build (production)", pnpm("build:release"));
h.step("tests", "Unit tests (vitest)", pnpm("test"));
h.step("pytest", "Backend tests (pytest)", py(`-m pytest ${q(join(ROOT, "src", "test", "test_main.py"))} -q`));
h.step("package", "Package (.zip)", py(q(join(ROOT, "scripts", "build", "package.py"))));
h.step("verify_pkg", "Verify package", py(q(join(ROOT, "scripts", "build", "verify-package.py"))));
h.step("compat", "Compat validation", pnpm("validate:compat"));

// ── Device availability ──────────────────────────────────────────────────────
let deviceOk = false;
const host = process.env.DECK_HOST || "";
const user = process.env.DECK_USER || "deck";
if (!h.buildOk) {
  process.stdout.write(`  ${C.yellow}– SKIP: Device availability (build failed)${C.reset}\n`);
  h.note("Device availability", "skip", "Skipped — build failed, device check not attempted.");
} else if (!host) {
  process.stdout.write(`  ${C.yellow}– SKIP: Device availability (DECK_HOST not set)${C.reset}\n`);
  h.note("Device availability", "skip", "DECK_HOST is not set in .env — device steps will be skipped.");
} else {
  const nullDev = process.platform === "win32" ? "NUL" : "/dev/null";
  const ssh = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=${nullDev} -o ConnectTimeout=5 -o BatchMode=yes ${q(`${user}@${host}`)} "exit 0"`;
  deviceOk = h.step("device", "Device availability", ssh, { device: true });
}

// ── Device steps ─────────────────────────────────────────────────────────────
if (!deviceOk) {
  h.skip("Deploy hard", "Device not available — skipped.");
  h.skip("UI tests", "Device not available — skipped.");
  h.skip("Performance benchmark", "Device not available — skipped.");
} else {
  const deploy =
    process.platform === "win32"
      ? `powershell -ExecutionPolicy Bypass -File ${q(join(ROOT, "scripts", "deploy", "deploy-deck.ps1"))} -Hard`
      : `bash ${q(join(ROOT, "scripts", "deploy", "deploy-deck.sh"))} --hard`;
  const deployEnv = stress ? { ...process.env, DS_QA_STRESS_FIXTURE: "1" } : process.env;
  const deployed = h.step("deploy", stress ? "Deploy hard (stress fixture)" : "Deploy hard", deploy, {
    device: true,
    env: deployEnv,
  });
  if (deployed) {
    process.stdout.write("  waiting 25 s for Steam to restart…\n");
    sleepMs(25000);
  }

  const port = process.env.DECK_CDP_PORT || "8081";
  // DECK_HOST may be an ssh-config alias (resolved by ssh, not getaddrinfo); CDP
  // over HTTP needs a resolvable address, so prefer DECK_CDP_HOST when set.
  const cdpHost = process.env.DECK_CDP_HOST || host;
  const outDir = q(join(tmp, "uitest-screenshots"));
  const only = stress
    ? ""
    : ` --only ${q("perf,home,qam_shelves,qam_smart,qam_global_toggles,crash_protection,context_menu")}`;
  h.step("uitests", stress ? "UI tests (all suites + stress)" : "UI tests (all suites)",
    py(`-m deckprobe.uitests.run --host ${q(cdpHost)} --port ${port} --out ${outDir}${only}`), { device: true });

  h.step("perf", "Performance benchmark (perf:bench)",
    py(q(join(ROOT, "deckprobe", "perf-bench.py"))), { device: true });
}

const ok = h.summarize();
process.exitCode = ok ? 0 : 1;
