// Shared, cross-platform QA harness used by validate.mjs (full) and
// validate-ci.mjs (no-device). Node replacement for the bash harness that lived
// in validate.sh / validate-ci.sh — runs on Windows, macOS, SteamOS, and Linux
// with no bash/python dependency for the harness itself (the HTML report is
// still rendered by report.py, invoked cross-OS via scripts/build/py.mjs).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const C = {
  green: "\x1b[0;32m",
  red: "\x1b[0;31m",
  yellow: "\x1b[1;33m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

const HERE = dirname(fileURLToPath(import.meta.url)); // scripts/ci/lib
const CI_DIR = join(HERE, ".."); // scripts/ci
export const ROOT = join(HERE, "..", "..", ".."); // repo root
const PY_LAUNCHER = join(ROOT, "scripts", "build", "py.mjs");
const REPORT_PY = join(CI_DIR, "report.py");

const NO_DEVICE =
  /Connection refused|Connection timed out|No route to host|ssh: connect to host|Network is unreachable|No target matching|timed out after|host key verification|Could not resolve hostname|Operation timed out/i;

/** Wrap a path so it survives cmd.exe + sh word-splitting under shell:true. */
export const q = (p) => `"${p}"`;

/** `python <args>` routed through the cross-OS launcher (as a shell string). */
export const py = (args) => `node ${q(PY_LAUNCHER)} ${args}`;

/** `pnpm --dir <ROOT> <script>` (pnpm resolves to pnpm.cmd on Windows). */
export const pnpm = (script) => `pnpm --dir ${q(ROOT)} ${script}`;

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Blocking sleep without a child process — portable across all OSes. */
export function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function _bigPictureUp(cdpHost, port) {
  try {
    const res = await fetch(`http://${cdpHost}:${port}/json`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const targets = await res.json();
    return Array.isArray(targets) && targets.some((t) => (t.title || "").includes("Big Picture"));
  } catch {
    return false; // not up yet, or the debug server is still (re)starting
  }
}

const CDP_PY = join(ROOT, "deckprobe", "cdp.py");

/** The Big Picture CDP target existing (above) only proves Steam's own UI
 *  process is up — observed live, that can be true well before the plugin
 *  itself has actually loaded: a perf-bench run right after a "stable" Big
 *  Picture check still found 0 shelves / 0 cards on the page. Checking
 *  `__ds_homepatch_loaded` (the module-load signal every other suite relies
 *  on) turned out to be one step too early too — set the instant the
 *  module *imports*, well before React actually resolves and renders the
 *  first shelf (settings fetch, resolveShelfAppIds, …), and the earliest
 *  uitest suites to run consistently caught that exact gap live. Checks the
 *  real end state instead: at least one `.ds-shelf` actually in the DOM. */
function _dsPluginLoaded(cdpHost, port) {
  const r = spawnSync(
    "node",
    [PY_LAUNCHER, CDP_PY, "eval", "bp", "String(document.querySelectorAll('.ds-shelf').length > 0)"],
    { encoding: "utf8", timeout: 6000, env: { ...process.env, DECK_HOST: cdpHost, DECK_CDP_PORT: String(port) } },
  );
  return r.status === 0 && r.stdout.trim() === "true";
}

/** Poll until Steam's Big Picture CDP target is up AND the plugin itself has
 *  loaded (see `_dsPluginLoaded`), with both confirmed stable across a
 *  second check `stableGapMs` later, or `timeoutMs` elapses. A fixed
 *  post-deploy sleep is a guess at restart time; this waits for the actual
 *  signal instead. Two flap modes were observed live and both need
 *  covering: the CDP debug server itself can flap right as it comes up (a
 *  target list responds once, then resets moments later — why a single
 *  successful poll isn't trustworthy on its own), and separately, Steam's
 *  UI can be up and CDP-stable well before the plugin has actually
 *  mounted (why the Big Picture check alone isn't sufficient either). */
export async function waitForBigPictureReady(cdpHost, port, { timeoutMs = 120000, pollMs = 2000, stableGapMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const bothUp = async () => (await _bigPictureUp(cdpHost, port)) && _dsPluginLoaded(cdpHost, port);
  while (Date.now() < deadline) {
    if (await bothUp()) {
      await new Promise((r) => setTimeout(r, stableGapMs));
      if (await bothUp()) return true;
      // Flapped — fall through and keep polling from scratch.
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

/** Load .env into process.env (KEY=VALUE, quotes stripped) without overriding
 *  values already set, so device steps see DECK_HOST etc. */
export function loadEnv(root = ROOT) {
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    /* no .env — fine */
  }
}

function runCommand(command, { cwd = ROOT, env = process.env } = {}) {
  const res = spawnSync(command, {
    cwd,
    env,
    shell: true,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const output = (res.stdout || "") + (res.stderr || "");
  return { ok: !res.error && res.status === 0, output };
}

export class Harness {
  constructor(tmpDir) {
    this.tmp = tmpDir;
    mkdirSync(tmpDir, { recursive: true });
    this.names = [];
    this.statuses = [];
    this.logs = [];
    this.durations = [];
    this.buildOk = true;
  }

  _record(label, status, logPath, durMs) {
    this.names.push(label);
    this.statuses.push(status);
    this.logs.push(logPath || "");
    this.durations.push(durMs || 0);
  }

  /** Record a step whose status we computed ourselves (e.g. device probe). */
  note(label, status, text = "") {
    let logPath = "";
    if (text) {
      logPath = join(this.tmp, `note_${this.names.length}.log`);
      writeFileSync(logPath, text.endsWith("\n") ? text : text + "\n");
    }
    this._record(label, status, logPath, 0);
  }

  step(key, label, command, { device = false, cwd = ROOT, env = process.env } = {}) {
    const logPath = join(this.tmp, `${key}.log`);
    process.stdout.write(`${C.bold}▶ ${label}${C.reset}\n`);
    const start = Date.now();
    const { ok, output } = runCommand(command, { cwd, env });
    const dur = Date.now() - start;
    writeFileSync(logPath, output);
    const secs = Math.floor(dur / 1000);
    if (ok) {
      process.stdout.write(`  ${C.green}✓ PASS${C.reset} (${secs}s)\n`);
      this._record(label, "pass", logPath, dur);
      return true;
    }
    if (device && NO_DEVICE.test(output)) {
      process.stdout.write(`  ${C.yellow}– SKIP (device unreachable)${C.reset} (${secs}s)\n`);
      this._record(label, "skip", logPath, dur);
      return false;
    }
    process.stdout.write(`  ${C.red}✗ FAIL${C.reset} (${secs}s)\n`);
    for (const line of output.replace(/\s+$/, "").split("\n").slice(-20)) {
      process.stdout.write(`    ${line}\n`);
    }
    this._record(label, "fail", logPath, dur);
    return false;
  }

  skip(label, reason = "") {
    process.stdout.write(`  ${C.yellow}– SKIP: ${label}${C.reset}\n`);
    this.note(label, "skip", reason);
  }

  report({ ts, stress = 0, subdir, reportDir }) {
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, `${ts}.html`);
    const stepsJson = join(reportDir, `.tmp_steps_${ts}.json`);
    writeFileSync(
      stepsJson,
      JSON.stringify({
        names: this.names,
        statuses: this.statuses,
        logs: this.logs,
        durations_ms: this.durations,
      }),
    );
    const base = [PY_LAUNCHER, REPORT_PY];
    const r = spawnSync(
      "node",
      [...base, "--ts", ts, "--stress", String(stress), "--subdir", subdir,
        "--tmp", this.tmp, "--out", reportPath, "--root", ROOT, "--steps-json", stepsJson],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      process.stdout.write(`  ${C.yellow}warn: report.py failed — check ${reportPath}${C.reset}\n`);
    }
    // Refresh ALL aggregates (per-scope indexes + manifests, the top index and
    // the dashboard) so the run — local ones included — shows up immediately
    // without a manual `reports:rebuild`. The top index and dashboard are
    // gitignored and rebuilt clean by CI (which has no local/ dir), so baking
    // local runs into them here never leaks local data into the published site.
    spawnSync("node", [...base, "--rebuild", "--root", ROOT], { stdio: "inherit" });
    try {
      rmSync(stepsJson, { force: true });
    } catch {
      /* best-effort */
    }
    process.stdout.write(`\n${C.bold}Report:${C.reset} file://${reportPath}\n`);
  }

  summarize() {
    const count = (s) => this.statuses.filter((x) => x === s).length;
    const passed = count("pass");
    const failed = count("fail");
    const skipped = count("skip");
    const total = this.statuses.length;
    process.stdout.write("\n");
    if (failed === 0) {
      process.stdout.write(`${C.green}${C.bold}ALL PASS${C.reset} — ${passed}/${total} steps passed, ${skipped} skipped\n`);
    } else {
      process.stdout.write(`${C.red}${C.bold}FAILED${C.reset} — ${failed} failed, ${passed} passed, ${skipped} skipped\n`);
    }
    return failed === 0;
  }
}
