#!/usr/bin/env node
// Full QA harness: typecheck → lint → i18n → build → vitest → pytest → package →
// verify → compat → device availability → deploy → uitests → perf.
// Device steps are skipped when the build fails or the Deck is unreachable.
// Cross-OS Node port of validate.sh. Usage: `pnpm qa` / `pnpm validate:full`
// (add `--stress`).
import { join } from "node:path";
import { rmSync } from "node:fs";
import { C, Harness, ROOT, loadEnv, pnpm, py, q, sleepMs, timestamp, waitForBigPictureReady } from "./lib/harness.mjs";

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
  const port = process.env.DECK_CDP_PORT || "8081";
  // DECK_HOST may be an ssh-config alias (resolved by ssh, not getaddrinfo); CDP
  // over HTTP needs a resolvable address, so prefer DECK_CDP_HOST when set.
  const cdpHost = process.env.DECK_CDP_HOST || host;

  // A fixed post-deploy sleep was a guess at restart time; wait for the
  // actual readiness signal instead — `waitForBigPictureReady` checks both
  // that Steam's Big Picture CDP target is up AND that the plugin itself
  // has loaded (not just Steam's UI process), each confirmed stable across
  // a second check, since both can flap independently right after a
  // restart (see its own doc comment for what was observed live).
  async function waitForRestart() {
    process.stdout.write("  waiting for Steam to restart…\n");
    const ready = await waitForBigPictureReady(cdpHost, port);
    if (!ready) {
      process.stdout.write(`  ${C.yellow}Plugin didn't come back stably in time — proceeding anyway.${C.reset}\n`);
    }
    // Small buffer even once confirmed stable, for the first shelf render
    // to settle right after the plugin signals loaded.
    sleepMs(5000);
  }

  // Non-stress runs also deploy with the QA decoration fixture (two shelves
  // with synthetic/decoration cards — every shape the `decoration` suite
  // checks) so that suite gets real data instead of guaranteed skips, then
  // the real build is redeployed right after uitests (below) so the device
  // isn't left showing placeholder shelves. Deliberately NOT the much
  // bigger templates fixture (~35 shelves incl. smart/composite/online) —
  // tried that first, and the extra concurrent-resolution load it adds
  // caused intermittent, unrelated timing failures in other suites that
  // have nothing to do with decoration. Stress keeps its own separate,
  // non-reverting convention (deploys the stress fixture and stays on it)
  // — unchanged.
  const deployEnv = stress
    ? { ...process.env, DS_QA_STRESS_FIXTURE: "1" }
    : { ...process.env, DS_QA_DECORATION_FIXTURE: "1" };
  const deployed = h.step("deploy", stress ? "Deploy hard (stress fixture)" : "Deploy hard (QA decoration fixture)", deploy, {
    device: true,
    env: deployEnv,
  });
  if (deployed) await waitForRestart();

  const outDir = q(join(tmp, "uitest-screenshots"));
  // Every suite except `stress` — that one needs the dedicated 30+17-shelf
  // fixture (`pnpm qa:stress-fixture`) deployed first, so it only runs under
  // `--stress`, which passes no `--only` filter at all (runs everything,
  // stress included). Listed explicitly (not discovered) so a suite file
  // that fails to import still counts as a real "missing" coverage gap
  // instead of quietly narrowing the filter to whatever loaded.
  const nonStressSuites = [
    "about", "context_menu", "context_menu_24", "crash_protection", "decoration",
    "edit_shelf_modal", "features_24", "home", "perf", "qam_global_toggles", "qam_shelves",
    "qam_smart", "search", "settings", "settings_page", "shelf_preview", "sidecar", "sidenav",
    "update", "usage_stats",
  ];
  const only = stress ? "" : ` --only ${q(nonStressSuites.join(","))}`;
  h.step("uitests", stress ? "UI tests (all suites + stress)" : "UI tests (all suites)",
    py(`-m deckprobe.uitests.run --host ${q(cdpHost)} --port ${port} --out ${outDir}${only}`), { device: true });

  if (!stress) {
    // Restore the real build before benchmarking — perf numbers need to
    // stay comparable against the user's actual shelf count/config across
    // runs, and a normal validate:full should never leave the device on
    // QA fixture data.
    const reverted = h.step("deploy_revert", "Deploy hard (revert to real build)", deploy, {
      device: true,
      env: process.env,
    });
    if (reverted) {
      await waitForRestart();
    } else {
      process.stdout.write(
        `  ${C.red}! Revert deploy failed — the device may still be showing QA templates-fixture shelves.${C.reset}\n` +
        `    Run \`pnpm run deploy:deck:hard\` manually to restore your real build.\n`,
      );
    }
  }

  h.step("perf", "Performance benchmark (perf:bench)",
    py(q(join(ROOT, "deckprobe", "perf-bench.py"))), { device: true });
}

const ok = h.summarize();
process.exitCode = ok ? 0 : 1;
