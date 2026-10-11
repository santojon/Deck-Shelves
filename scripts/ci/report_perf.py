#!/usr/bin/env python3
"""Device-perf records for the reports site.

The device probes (`perf:gate` / backnav_gate.py, soak.py, perf_matrix.py,
idle_cpu.py, battery_soak.py) each overwrite one `site/reports/perf/<kind>-latest.json`
— that is what `perf-gate.mjs` judges. To make the runs comparable over time, the
rebuild step:

  1. archives every `*-latest.json` into `perf/history/<kind>/<recordedAt>.json`
     (idempotent — keyed by `recordedAt`; the plugin version is stamped in when
     the probe didn't record one), and
  2. writes `perf/manifest.json`: one flat summary row per archived run, grouped
     by kind, in the shape the dashboard's trend charts already consume
     (`ts`, `version`, plus the metrics).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

LATEST_SUFFIX = "-latest.json"
MATRIX_SCENARIOS = ("vanilla", "empty", "typical_8x20", "stress_16x50", "large_2000", "huge_5000")


def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _plugin_version(root: Path) -> str:
    try:
        return str(json.loads((root / "package.json").read_text(encoding="utf-8")).get("version", ""))
    except Exception:
        return ""


def _safe_ts(ts: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "-", ts)[:40] or "unknown"


def archive_perf_records(reports_root: Path, root: Path) -> int:
    """Copy each `<kind>-latest.json` into `history/<kind>/<ts>.json` once."""
    perf = reports_root / "perf"
    if not perf.exists():
        return 0
    version = _plugin_version(root)
    added = 0
    for latest in sorted(perf.glob(f"*{LATEST_SUFFIX}")):
        rec = _read_json(latest)
        ts = rec.get("recordedAt") if rec else None
        if not rec or not ts:
            continue
        kind = latest.name[: -len(LATEST_SUFFIX)]
        dest = perf / "history" / kind / f"{_safe_ts(str(ts))}.json"
        if not rec.get("version"):
            rec = {**rec, "version": version}
        text = json.dumps(rec, indent=2) + "\n"
        # Same recordedAt, new content = the probe extended that run (e.g. a third
        # battery half appended later): the archive follows the latest file.
        if dest.exists() and dest.read_text(encoding="utf-8") == text:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        added += 1
    return added


def _sum_leaks(rec: dict) -> Optional[int]:
    leaks = rec.get("leakDelta")
    if not isinstance(leaks, dict):
        return None
    return sum(int(v) for v in leaks.values() if isinstance(v, (int, float)))


def _summarize_backnav(rec: dict) -> dict:
    heap = rec.get("heapMb") or {}
    return {
        "cycles": rec.get("cycles"), "fullMsAvg": rec.get("fullMsAvg"), "fullMsMax": rec.get("fullMsMax"),
        "selectionKept": rec.get("selectionKept"), "selectionJudged": rec.get("selectionJudged", rec.get("cycles")),
        "maxRoots": rec.get("maxRoots"), "fallbackMounts": rec.get("fallbackMounts"), "leaks": _sum_leaks(rec),
        "heapStartMb": heap.get("start"), "heapEndMb": heap.get("end"),
    }


def _summarize_soak(rec: dict) -> dict:
    ok, cycles = rec.get("ok"), rec.get("cycles")
    pct = round(100.0 * ok / cycles, 1) if isinstance(ok, (int, float)) and cycles else None
    return {"mode": rec.get("mode"), "coexist": bool(rec.get("coexist")), "ok": ok, "cycles": cycles, "okPct": pct}


def _summarize_matrix(rec: dict) -> dict:
    out: Dict[str, Any] = {}
    for row in rec.get("results") or []:
        sc = row.get("scenario")
        if sc not in MATRIX_SCENARIOS:
            continue
        out[f"{sc}_returnMs"] = row.get("return_t_full_ms")
        out[f"{sc}_settleMs"] = row.get("settleMs")
        out[f"{sc}_heapMb"] = row.get("heapMbAfterGc")
        out[f"{sc}_error"] = bool(row.get("error"))
    return out


def _summarize_idle(rec: dict) -> dict:
    with_p = rec.get("withPlugin") or {}
    without = rec.get("withoutPlugin") or {}
    return {
        "deltaPp": rec.get("deltaPp"), "withPluginPct": with_p.get("total", rec.get("withPluginPct")),
        "pluginFreePct": without.get("total", rec.get("withoutLoaderPct")), "acOnline": rec.get("acOnline"),
        "withPluginW": with_p.get("batteryW"), "pluginFreeW": without.get("batteryW"),
    }


def _summarize_battery(rec: dict) -> dict:
    return {
        "minutesPerHalf": rec.get("minutesPerHalf"), "deltaW": rec.get("deltaW"), "deltaWPluginOnly": rec.get("deltaWPluginOnly"),
        "withPluginW": (rec.get("withPlugin") or {}).get("avgWFromEnergy"), "pluginFreeW": (rec.get("pluginFree") or {}).get("avgWFromEnergy"),
        "hubOnlyW": (rec.get("hubOnlyPlugin") or {}).get("avgWFromEnergy"),
    }


def summarize(kind: str, rec: dict) -> dict:
    base = {"kind": kind, "ts": rec.get("recordedAt"), "version": rec.get("version")}
    if kind.startswith("backnav"):
        base.update(_summarize_backnav(rec))
    elif kind.startswith("soak-"):
        base.update(_summarize_soak(rec))
    elif kind == "perf-matrix":
        base.update(_summarize_matrix(rec))
    elif kind == "idle-cpu":
        base.update(_summarize_idle(rec))
    elif kind == "battery-soak":
        base.update(_summarize_battery(rec))
    return base


def build_perf_manifest(reports_root: Path) -> Optional[dict]:
    """Write `perf/manifest.json` from the archived history; None when there is none."""
    hist = reports_root / "perf" / "history"
    if not hist.exists():
        return None
    kinds: Dict[str, List[dict]] = {}
    for kind_dir in sorted(p for p in hist.iterdir() if p.is_dir()):
        rows = []
        for f in sorted(kind_dir.glob("*.json")):
            rec = _read_json(f)
            if rec:
                rows.append({**summarize(kind_dir.name, rec), "file": f"history/{kind_dir.name}/{f.name}"})
        rows.sort(key=lambda r: str(r.get("ts") or ""))
        kinds[kind_dir.name] = rows
    manifest = {"kinds": kinds, "runs": sum(len(v) for v in kinds.values())}
    (reports_root / "perf" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
