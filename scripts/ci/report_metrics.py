#!/usr/bin/env python3
"""Log parsing, per-run metric extraction, and version helpers for the CI
report. Split out of report.py to keep it under the per-file code-line cap
(same reason report_dashboard.py is separate). Self-contained — no imports
from report.py, so report.py can import freely from here."""
from __future__ import annotations

import html as _html
import io
import json
import re
import subprocess
import tarfile
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

_ANSI = re.compile(r'\x1b\[[0-9;]*[mGKHF]|\x1b\][\s\S]*?\x07|\x1b[()][AB]')


def _strip(text: str) -> str:
    return _ANSI.sub('', text)


# ── Test / lint log parsing ─────────────────────────────────────────────────────
_UITEST_LINE = re.compile(r'^(PASS|FAIL|SKIP|ERROR)\s+([a-z_]+)\.(.+?)(?:\s+::.*)?$')


def _parse_uitests_by_suite(log_text: str) -> dict:
    """Parse UI test output into per-suite {passed,failed,skipped} counts.

    Input lines:
        PASS home.renders at least one shelf
        FAIL qam_shelves.Add shelf button :: reason
        SKIP stress.enter + exit :: timeout
    """
    text = _strip(log_text)
    by_suite: dict = {}
    for line in text.splitlines():
        line = line.strip()
        m = _UITEST_LINE.match(line)
        if not m:
            continue
        status, suite, _ = m.group(1), m.group(2), m.group(3)
        s = by_suite.setdefault(suite, {"passed": 0, "failed": 0, "skipped": 0})
        if status == "PASS":
            s["passed"] += 1
        elif status in ("FAIL", "ERROR"):
            s["failed"] += 1
        elif status == "SKIP":
            s["skipped"] += 1
    return by_suite


def _parse_unit_tests(log_text: str) -> dict:
    """Vitest summary line -> {passed,failed,skipped,total}. Matches both
    `Tests  496 passed (496)` and `Tests  2 failed | 494 passed (496)`
    (after ANSI stripping). Empty dict when the summary isn't present."""
    text = _strip(log_text)
    m = re.search(r'^\s*Tests\s+(.+?)\s*$', text, re.M)
    if not m:
        return {}
    seg = m.group(1)

    def _n(kind: str) -> int:
        mm = re.search(r'(\d+)\s+' + kind, seg)
        return int(mm.group(1)) if mm else 0

    passed, failed, skipped = _n("passed"), _n("failed"), _n("skipped")
    tm = re.search(r'\((\d+)\)', seg)
    total = int(tm.group(1)) if tm else (passed + failed + skipped)
    if total <= 0:
        return {}
    return {"passed": passed, "failed": failed, "skipped": skipped, "total": total}


def _parse_pytest(log_text: str) -> dict:
    """Pytest summary -> {passed,failed,skipped,total}. Matches `70 passed in
    1.2s` and `2 failed, 68 passed, 1 skipped`. Empty dict when not present."""
    text = _strip(log_text)

    def _n(kind: str) -> int:
        m = re.search(r'(\d+)\s+' + kind, text)
        return int(m.group(1)) if m else 0

    passed, failed, skipped = _n("passed"), _n("failed"), _n("skipped")
    total = passed + failed + skipped
    if total <= 0:
        return {}
    return {"passed": passed, "failed": failed, "skipped": skipped, "total": total}


def _parse_ruff(log_text: str) -> int:
    """Ruff issue count from the combined lint log: `Found N error(s)`, else 0
    (a clean `All checks passed!` leaves no such line)."""
    m = re.search(r'Found (\d+) error', _strip(log_text))
    return int(m.group(1)) if m else 0


def _parse_lint_problems(log_text: str) -> int:
    """Total lint problems: eslint's `N problems` + ruff's `Found N errors`."""
    text = _strip(log_text)
    total = 0
    m = re.search(r'(\d+)\s+problems?\b', text)
    if m:
        total += int(m.group(1))
    r = re.search(r'Found (\d+) error', text)
    if r:
        total += int(r.group(1))
    return total


def _read_suppressions(root: str) -> int:
    """Suppressed eslint problems = bulk eslint-suppressions.json counts + inline
    `eslint-disable` directives across src/ — the lint debt being paid down."""
    bulk = 0
    try:
        d = json.loads((Path(root) / "eslint-suppressions.json").read_text())
        bulk = sum(v.get("count", 0) for f in d.values() for v in f.values() if isinstance(v, dict))
    except Exception:
        bulk = 0
    inline = 0
    src = Path(root) / "src"
    if src.is_dir():
        for p in src.rglob("*.ts*"):
            if p.suffix in (".ts", ".tsx") and p.is_file():
                try:
                    inline += p.read_text(errors="replace").count("eslint-disable")
                except OSError:
                    pass
    return bulk + inline


def _run_complexity_metric(src_dir: str, root: str) -> Optional[dict]:
    """Run the syntax-only complexity metric (scripts/ci/complexity-metric.mjs)
    against a src/ dir and return {level, count, max, avg, top}. None on any
    failure (node missing, timeout, bad output)."""
    script = Path(root) / "scripts" / "ci" / "complexity-metric.mjs"
    if not script.exists():
        return None
    try:
        res = subprocess.run(["node", str(script), src_dir], cwd=root,
                             capture_output=True, text=True, timeout=180)
    except Exception:
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        d = json.loads(out)
    except Exception:
        return None
    return d if isinstance(d, dict) else None


def _read_complexity(root: str) -> Optional[dict]:
    """Cyclomatic-complexity DEBT for the current tree: the sum of the scores of
    every function over the limit (`level`) plus count / max / avg / top-10.
    Distinct from _read_suppressions (a COUNT) — this is the MAGNITUDE, so it
    rises when code gets structurally deeper even if the offender count is flat."""
    return _run_complexity_metric(str(Path(root) / "src"), root)


def _run_decoupling_metric(src_dir: str, root: str) -> Optional[dict]:
    """Run the decoupling metric (scripts/ci/decoupling-metric.mjs) and return
    {leaks, adapter, ratio, top}. None on any failure."""
    script = Path(root) / "scripts" / "ci" / "decoupling-metric.mjs"
    if not script.exists():
        return None
    try:
        res = subprocess.run(["node", str(script), src_dir], cwd=root,
                             capture_output=True, text=True, timeout=120)
    except Exception:
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        d = json.loads(out)
    except Exception:
        return None
    return d if isinstance(d, dict) else None


def _read_decoupling(root: str) -> Optional[dict]:
    """Decoupling DEBT for the current tree: the number of direct @decky import
    call sites OUTSIDE the isolation layer (`leaks`, LOWER is better) plus the
    adapter-import count and the leak `ratio` %. Drops as call sites are routed
    through the single host-adapter seam."""
    return _run_decoupling_metric(str(Path(root) / "src"), root)


def _run_portability_metric(backend_dir: str, root: str) -> Optional[dict]:
    """Run the platform-portability metric (scripts/ci/platform-portability-metric.py)
    and return {coupled, guarded, unguarded, top}. None on any failure."""
    script = Path(root) / "scripts" / "ci" / "platform-portability-metric.py"
    if not script.exists():
        return None
    try:
        res = subprocess.run(["python3", str(script), backend_dir], cwd=root,
                             capture_output=True, text=True, timeout=120)
    except Exception:
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        d = json.loads(out)
    except Exception:
        return None
    return d if isinstance(d, dict) else None


def _read_portability(root: str) -> Optional[dict]:
    """Platform-portability DEBT for the current tree: OS-coupled backend call
    sites (Linux paths, OS tools/APIs) that are NOT fail-soft (`unguarded`,
    LOWER is better; target 0 — every OS touch must be guarded). `coupled` and
    `guarded` are informational. Backend modules live at the repo root."""
    return _run_portability_metric(str(root), root)


def _complexity_at_tag(version: str, root: str) -> Optional[dict]:
    """Complexity metric for a released version, computed by archiving that
    tag's src/ tree and running the syntax-only metric against it. None when the
    tag is missing or anything fails. `top` is dropped (paths are tag-local)."""
    tag = f"v{version}"
    try:
        chk = subprocess.run(["git", "rev-parse", "--verify", "--quiet", tag],
                            cwd=root, capture_output=True, text=True)
        if chk.returncode != 0:
            return None
        arch = subprocess.run(["git", "archive", tag, "src"], cwd=root,
                             capture_output=True, timeout=60)
        if arch.returncode != 0 or not arch.stdout:
            return None
    except Exception:
        return None
    # Extract UNDER root so the files sit inside eslint's cwd (files outside the
    # working directory are silently skipped by flat config).
    with tempfile.TemporaryDirectory(dir=root) as tmp:
        try:
            with tarfile.open(fileobj=io.BytesIO(arch.stdout)) as tf:
                try:
                    tf.extractall(tmp, filter="data")
                except TypeError:
                    tf.extractall(tmp)
        except Exception:
            return None
        m = _run_complexity_metric(str(Path(tmp) / "src"), root)
    if m:
        m.pop("top", None)
    return m


def _reports_needing_complexity(reports_root: Path) -> dict:
    """version -> [run JSON paths] for runs that carry a version but no measured
    complexity yet (used by the backfill)."""
    need: dict = {}
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for p in sp.glob("*.json"):
            if p.name == "runs-manifest.json" or p.name.startswith((".", "_")):
                continue
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            ver = m.get("version")
            if ver and not isinstance(m.get("complexity"), dict):
                need.setdefault(ver, []).append(p)
    return need


def _backfill_complexity(reports_root: Path, root: str) -> int:
    """Stamp historical `complexity` (marked estimated) onto version-tagged runs
    that lack it — one metric run per unique tagged version. Untagged versions
    are skipped, so the series stays sparse like the suppressions chart."""
    need = _reports_needing_complexity(reports_root)
    if not need:
        return 0
    n = 0
    for ver, paths in need.items():
        metric = _complexity_at_tag(ver, root)
        if not metric:
            continue
        for p in paths:
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            m["complexity"] = metric
            m["complexityEst"] = True
            p.write_text(json.dumps(m, indent=2), encoding="utf-8")
            n += 1
    return n


def _decoupling_at_tag(version: str, root: str) -> Optional[dict]:
    """Decoupling metric for a released version, measured by extracting that
    tag's src/ tree (git archive — never touches the working tree) and running
    the import-scan metric against it. None when the tag is missing or anything
    fails. `top` is dropped (paths are tag-local)."""
    tag = f"v{version}"
    try:
        chk = subprocess.run(["git", "rev-parse", "--verify", "--quiet", tag],
                            cwd=root, capture_output=True, text=True)
        if chk.returncode != 0:
            return None
        arch = subprocess.run(["git", "archive", tag, "src"], cwd=root,
                             capture_output=True, timeout=60)
        if arch.returncode != 0 or not arch.stdout:
            return None
    except Exception:
        return None
    with tempfile.TemporaryDirectory(dir=root) as tmp:
        try:
            with tarfile.open(fileobj=io.BytesIO(arch.stdout)) as tf:
                try:
                    tf.extractall(tmp, filter="data")
                except TypeError:
                    tf.extractall(tmp)
        except Exception:
            return None
        m = _run_decoupling_metric(str(Path(tmp) / "src"), root)
    if m:
        m.pop("top", None)
    return m


def _reports_needing_decoupling(reports_root: Path) -> dict:
    """version -> [run JSON paths] for runs that carry a version but no measured
    decoupling metric yet (used by the backfill)."""
    need: dict = {}
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for p in sp.glob("*.json"):
            if p.name == "runs-manifest.json" or p.name.startswith((".", "_")):
                continue
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            ver = m.get("version")
            if ver and not isinstance(m.get("decoupling"), dict):
                need.setdefault(ver, []).append(p)
    return need


def _backfill_decoupling(reports_root: Path, root: str) -> int:
    """Stamp historical `decoupling` (marked estimated) onto version-tagged runs
    that lack it — one metric run per unique tagged version. Older tags predate
    the isolation layer, so their leak count is legitimately high; the series
    then falls as the host-adapter seam was adopted."""
    need = _reports_needing_decoupling(reports_root)
    if not need:
        return 0
    n = 0
    for ver, paths in need.items():
        metric = _decoupling_at_tag(ver, root)
        if not metric:
            continue
        for p in paths:
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            m["decoupling"] = metric
            m["decouplingEst"] = True
            p.write_text(json.dumps(m, indent=2), encoding="utf-8")
            n += 1
    return n


def _portability_at_tag(version: str, root: str) -> Optional[dict]:
    """Portability metric for a released version, measured by extracting that
    tag's top-level *.py (the backend modules; `git archive` — never touches the
    working tree) and re-running the scan. None if the tag is missing/fails."""
    tag = f"v{version}"
    try:
        chk = subprocess.run(["git", "rev-parse", "--verify", "--quiet", tag],
                            cwd=root, capture_output=True, text=True)
        if chk.returncode != 0:
            return None
        arch = subprocess.run(["git", "archive", tag], cwd=root,
                             capture_output=True, timeout=60)
        if arch.returncode != 0 or not arch.stdout:
            return None
    except Exception:
        return None
    with tempfile.TemporaryDirectory(dir=root) as tmp:
        try:
            with tarfile.open(fileobj=io.BytesIO(arch.stdout)) as tf:
                members = [m for m in tf.getmembers()
                           if "/" not in m.name and m.name.endswith(".py")]
                try:
                    tf.extractall(tmp, members=members, filter="data")
                except TypeError:
                    tf.extractall(tmp, members=members)
        except Exception:
            return None
        m = _run_portability_metric(str(tmp), root)
    if m:
        m.pop("top", None)
    return m


def _reports_needing_portability(reports_root: Path) -> dict:
    """version -> [run JSON paths] for version-tagged runs with no portability
    metric yet (used by the backfill)."""
    need: dict = {}
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for p in sp.glob("*.json"):
            if p.name == "runs-manifest.json" or p.name.startswith((".", "_")):
                continue
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            ver = m.get("version")
            if ver and not isinstance(m.get("portability"), dict):
                need.setdefault(ver, []).append(p)
    return need


def _backfill_portability(reports_root: Path, root: str) -> int:
    """Stamp historical `portability` (marked estimated) onto version-tagged runs
    that lack it — one metric run per unique tagged version."""
    need = _reports_needing_portability(reports_root)
    if not need:
        return 0
    n = 0
    for ver, paths in need.items():
        metric = _portability_at_tag(ver, root)
        if not metric:
            continue
        for p in paths:
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            m["portability"] = metric
            m["portabilityEst"] = True
            p.write_text(json.dumps(m, indent=2), encoding="utf-8")
            n += 1
    return n


def _extract_metrics(names: List[str], logs: List[str]) -> dict:  # noqa: C901
    """Parse per-run metrics (UI suites, vitest, pytest, lint/ruff) from the
    step logs a run captured. Each is empty when its step didn't run."""
    out = {"per_suite": {}, "unit": {}, "pytest": {}, "ruff": {}, "lint": {}}
    for step_name, log_path in zip(names, logs):
        if not (log_path and Path(log_path).exists()):
            continue
        nl = step_name.lower()
        try:
            txt = Path(log_path).read_text(errors="replace")
        except OSError:
            continue
        if "ui test" in nl and not out["per_suite"]:
            out["per_suite"] = _parse_uitests_by_suite(txt)
        elif ("unit test" in nl or "vitest" in nl) and not out["unit"]:
            out["unit"] = _parse_unit_tests(txt)
        elif ("pytest" in nl or "backend test" in nl) and not out["pytest"]:
            out["pytest"] = _parse_pytest(txt)
        elif "lint" in nl and not out["lint"]:
            out["ruff"] = {"issues": _parse_ruff(txt)}
            out["lint"] = {"problems": _parse_lint_problems(txt)}
    return out


# ── Version helpers ─────────────────────────────────────────────────────────────
_REL_RE = re.compile(r'^\s*##\s*\[(\d+\.\d+\.\d+[^\]]*)\]\s*-\s*(\d{4}-\d{2}-\d{2})')


def _semver_key(v: str) -> tuple:
    m = re.match(r'(\d+)\.(\d+)\.(\d+)', v or "")
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def _read_version(root: str) -> str:
    """The package.json version at report time — stamped onto each new run."""
    try:
        return str(json.loads((Path(root) / "package.json").read_text()).get("version") or "")
    except Exception:
        return ""


def _changelog_releases(root: str) -> List[Tuple[str, str]]:
    """Parse CHANGELOG.md `## [X.Y.Z] - YYYY-MM-DD` lines into (date, version),
    sorted ascending by (date, semver) so same-day releases order by patch."""
    out: List[Tuple[str, str]] = []
    try:
        for line in (Path(root) / "CHANGELOG.md").read_text(encoding="utf-8").splitlines():
            m = _REL_RE.match(line)
            if m:
                out.append((m.group(2), m.group(1)))
    except OSError:
        pass
    out.sort(key=lambda dv: (dv[0], _semver_key(dv[1])))
    return out


def _version_for_date(ts: str, releases: List[Tuple[str, str]]) -> str:
    """Probable version for a run: the latest release whose date <= the run's day."""
    day = (ts or "")[:10]
    ver = ""
    for date, v in releases:
        if date <= day:
            ver = v
        else:
            break
    return ver


def _backfill_versions(reports_root: Path, root: str) -> int:
    """Stamp a `version` onto every run JSON that lacks one, inferred from its
    date against the changelog. Idempotent — already-versioned runs are left
    untouched. Run before every rebuild so old runs gain a version once."""
    releases = _changelog_releases(root)
    if not releases:
        return 0
    n = 0
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for p in sp.glob("*.json"):
            if p.name == "runs-manifest.json" or p.name.startswith((".", "_")):
                continue
            try:
                m = json.loads(p.read_text())
            except Exception:
                continue
            if m.get("version"):
                continue
            ver = _version_for_date(m.get("ts", ""), releases)
            if not ver:
                continue
            m["version"] = ver
            p.write_text(json.dumps(m, indent=2), encoding="utf-8")
            n += 1
    return n


def _backfill_html_versions(reports_root: Path) -> int:
    """Inject the version badge into already-rendered run detail pages that
    predate version stamping. Per-run HTML is written once at run time and not
    regenerated by --rebuild (the step logs are gone), so this patches the one
    header <h1> in place. Idempotent — pages that already carry the badge are
    skipped."""
    n = 0
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for jp in sp.glob("*.json"):
            if jp.name == "runs-manifest.json" or jp.name.startswith((".", "_")):
                continue
            hp = jp.with_suffix(".html")
            if not hp.exists():
                continue
            try:
                ver = json.loads(jp.read_text()).get("version")
                html = hp.read_text()
            except (OSError, ValueError):
                continue
            if not ver or "background:#0c2a4d" in html:
                continue
            badge = (f'<span class="stress-tag" style="background:#0c2a4d;color:#7dd3fc">'
                     f'v{_html.escape(str(ver))}</span>')
            patched = html.replace("</h1>", badge + "</h1>", 1)
            if patched != html:
                hp.write_text(patched, encoding="utf-8")
                n += 1
    return n
