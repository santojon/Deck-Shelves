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
for (const w of warnings) console.log(`  ⚠️  ${w}`);
for (const p of problems) console.log(`  ❌ ${p}`);
if (!problems.length) console.log(`  ✅ within thresholds${warnings.length ? " (with warnings)" : ""}`);
process.exit(problems.length ? 1 : 0);
