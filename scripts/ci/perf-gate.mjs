#!/usr/bin/env node
/* Device perf gate — judges the most recent RECORDED on-device runs against
   the thresholds in scripts/deckprobe-ext/perf-bench.config.json.

   CI has no Steam Deck, so the measurement itself happens on a device
   (`python3 scripts/deckprobe-ext/probes/backnav_gate.py` writes
   site/reports/perf/backnav-latest.json); this script is the repeatable,
   threshold-based verdict on that record. Fails (exit 1) on any `fail`
   threshold; warns on `warn`; passes on a missing record only with --allow-missing. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cfgPath = resolve(root, "scripts/deckprobe-ext/perf-bench.config.json");
const recPath = resolve(root, "site/reports/perf/backnav-latest.json");
const allowMissing = process.argv.includes("--allow-missing");
const maxAgeDays = Number((process.argv.find((a) => a.startsWith("--max-age-days=")) ?? "").split("=")[1] || 0);

const t = JSON.parse(readFileSync(cfgPath, "utf8")).thresholds ?? {};
if (!existsSync(recPath)) {
  console.log(allowMissing ? "perf-gate: no recorded back-nav run (allowed)" : "perf-gate: no recorded back-nav run — run the device gate first");
  process.exit(allowMissing ? 0 : 1);
}
const r = JSON.parse(readFileSync(recPath, "utf8"));

const problems = [];
const warnings = [];
const check = (label, bad, warnOnly = false) => { if (bad) (warnOnly ? warnings : problems).push(label); };

check(`fullMsAvg ${r.fullMsAvg} > warn ${t.backnav_full_ms_avg_warn}`, r.fullMsAvg > t.backnav_full_ms_avg_warn && r.fullMsAvg <= t.backnav_full_ms_avg_fail, true);
check(`fullMsAvg ${r.fullMsAvg} > fail ${t.backnav_full_ms_avg_fail}`, r.fullMsAvg > t.backnav_full_ms_avg_fail);
check(`fullMsMax ${r.fullMsMax} > fail ${t.backnav_full_ms_max_fail}`, r.fullMsMax > t.backnav_full_ms_max_fail);
check(`fullMeasured ${r.fullMeasured}/${r.cycles} cycles never reached the full shelf set`, r.fullMeasured < r.cycles);
const judged = r.selectionJudged ?? r.cycles;
check(`selectionKept ${r.selectionKept}/${judged} < ${t.backnav_selection_kept_min_ratio}`, judged > 0 && r.selectionKept / judged < t.backnav_selection_kept_min_ratio);
check(`selection judged in only ${judged}/${r.cycles} cycles (no focused card to remember before leaving)`, r.cycles > 0 && judged < r.cycles * 0.75, true);
check(`maxRoots ${r.maxRoots} > ${t.backnav_max_roots}`, r.maxRoots > t.backnav_max_roots);
check(`fallbackMounts ${r.fallbackMounts} > ${t.backnav_fallback_mounts_max}`, r.fallbackMounts > t.backnav_fallback_mounts_max);
check(`recentsVisibleAtEnd ${r.recentsVisibleAtEnd} > ${t.backnav_recents_visible_at_end_max}`, r.recentsVisibleAtEnd > t.backnav_recents_visible_at_end_max);
for (const [k, v] of Object.entries(r.leakDelta ?? {})) check(`${k} delta ${v} > ${t.backnav_leak_delta_max}`, v > t.backnav_leak_delta_max);
if (r.heapMb?.start != null && r.heapMb?.end != null && t.backnav_heap_growth_mb_max != null) {
  const growth = r.heapMb.end - r.heapMb.start;
  check(`heap grew ${growth} MB after GC (> ${t.backnav_heap_growth_mb_max})`, growth > t.backnav_heap_growth_mb_max);
}
if (maxAgeDays > 0) {
  const ageDays = (Date.now() - Date.parse(r.recordedAt)) / 86_400_000;
  check(`record is ${ageDays.toFixed(1)} days old (> ${maxAgeDays})`, ageDays > maxAgeDays, true);
}

console.log(`perf-gate: back-nav record ${r.recordedAt} — ${r.cycles} cycles, full ${r.fullMsAvg} ms avg / ${r.fullMsMax} ms max, selection ${r.selectionKept}/${r.cycles}, roots ≤${r.maxRoots}, fallback ${r.fallbackMounts}, leaks ${JSON.stringify(r.leakDelta)}`);

/* The other device records are optional (each probe writes its own file);
   when present they are judged too, so one command covers the whole contract. */
const optional = (name) => { const p = resolve(root, `site/reports/perf/${name}`); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };
const matrix = optional("perf-matrix-latest.json");
if (matrix) {
  for (const row of matrix.results ?? []) {
    const name = row.scenario;
    check(`matrix ${name}: ${row.error}`, !!row.error);
    const retMax = t.matrix_return_ms_fail?.[name];
    const setMax = t.matrix_settle_ms_fail?.[name];
    check(`matrix ${name}: warm return ${row.return_t_full_ms} ms > ${retMax}`, retMax != null && row.return_t_full_ms != null && row.return_t_full_ms > retMax);
    check(`matrix ${name}: settle ${row.settleMs} ms > ${setMax}`, setMax != null && row.settleMs > setMax);
    check(`matrix ${name}: heap ${row.heapMbAfterGc} MB > ${t.matrix_heap_mb_max}`, t.matrix_heap_mb_max != null && row.heapMbAfterGc > t.matrix_heap_mb_max);
  }
  console.log(`perf-gate: perf-matrix record ${matrix.recordedAt} — ${(matrix.results ?? []).map((x) => `${x.scenario} ${x.return_t_full_ms ?? "—"} ms`).join(", ")}`);
}
for (const mode of ["reload", "restart", "sleepwake", "restart-coexist", "reload-coexist"]) {
  const s = optional(`soak-${mode}-latest.json`);
  if (!s) continue;
  check(`soak ${mode}: ${s.ok}/${s.cycles} OK < ${t.soak_ok_ratio_min}`, s.cycles > 0 && s.ok / s.cycles < (t.soak_ok_ratio_min ?? 1));
  console.log(`perf-gate: soak ${mode} record ${s.recordedAt} — ${s.ok}/${s.cycles} OK`);
}
const idle = optional("idle-cpu-latest.json");
if (idle) {
  check(`idle CPU delta ${idle.deltaPp} pp > ${t.idle_cpu_delta_pp_fail}`, t.idle_cpu_delta_pp_fail != null && idle.deltaPp > t.idle_cpu_delta_pp_fail);
  console.log(`perf-gate: idle-CPU record ${idle.recordedAt} — plugin-free ${idle.withoutPlugin?.total ?? idle.withoutLoaderPct} %, with plugin ${idle.withPlugin?.total ?? idle.withPluginPct} % (delta ${idle.deltaPp} pp, AC=${idle.acOnline})`);
}
for (const w of warnings) console.log(`  ⚠️  ${w}`);
for (const p of problems) console.log(`  ❌ ${p}`);
if (!problems.length) console.log(`  ✅ within thresholds${warnings.length ? " (with warnings)" : ""}`);
process.exit(problems.length ? 1 : 0);
