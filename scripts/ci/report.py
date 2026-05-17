#!/usr/bin/env python3
"""
Generate an HTML validation report + subfolder and top-level indexes.

Layout:
  reports/
    index.html          ← top-level, links to all three subfolders
    manual/
      index.html
      YYYY-MM-DD_HH-MM-SS.html + .json
    ci/
      index.html
      ...
    release/
      index.html
      ...

Called by validate*.sh with --steps-json and --subdir.
"""
from __future__ import annotations

import argparse
import html as _html
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

# ── ANSI strip ─────────────────────────────────────────────────────────────────
_ANSI = re.compile(r'\x1b\[[0-9;]*[mGKHF]|\x1b\][\s\S]*?\x07|\x1b[()][AB]')

def _strip(text: str) -> str:
    return _ANSI.sub('', text)


# ── File-reference linker ──────────────────────────────────────────────────────
_FILE_RE = re.compile(
    r'(?P<file>(?:[A-Za-z]:[\\/]|/|(?:src|test|scripts|checks)/)\S+?'
    r'\.(?:ts|tsx|js|py|sh|mjs))'
    r'(?:[:(](?P<line>\d+)(?:[,:](?P<col>\d+))?[):]?)?'
)

def _linkify(root: str, raw: str) -> str:
    out, last = [], 0
    for m in _FILE_RE.finditer(raw):
        out.append(_html.escape(raw[last:m.start()]))
        f = m.group("file")
        if not os.path.isabs(f):
            f = os.path.join(root, f)
        line = m.group("line")
        href = f"vscode://file/{f}" + (f":{line}" if line else "")
        out.append(f'<a class="fl" href="{_html.escape(href)}">{_html.escape(m.group(0))}</a>')
        last = m.end()
    out.append(_html.escape(raw[last:]))
    return "".join(out)


_MAX_LOG_LINES = 500  # truncate logs beyond this to keep the DOM lightweight

def _colorize(root: str, raw_text: str) -> str:
    text = _strip(raw_text)
    all_lines = text.split("\n")
    truncated = False
    if len(all_lines) > _MAX_LOG_LINES:
        all_lines = all_lines[-_MAX_LOG_LINES:]
        truncated = True
    lines = []
    if truncated:
        lines.append('<span class="w">… (log truncated, showing last 500 lines) …</span>')
    for raw in all_lines:
        linked = _linkify(root, raw)
        low = raw.lower()
        if any(k in low for k in (" error", "error:", "✗", "× ", "failed", " fail ")):
            lines.append(f'<span class="e">{linked}</span>')
        elif any(k in low for k in ("warn", "⚠", "warning")):
            lines.append(f'<span class="w">{linked}</span>')
        elif any(k in low for k in (" pass", "✓", "✅", " ok ", "success", "passed")):
            lines.append(f'<span class="g">{linked}</span>')
        else:
            lines.append(linked)
    return "\n".join(lines)


def _file_issues(log_text: str, root: str) -> List[Tuple[str, str, str]]:
    text = _strip(log_text)
    seen: set = set()
    out = []
    for m in _FILE_RE.finditer(text):
        f = m.group("file")
        if not os.path.isabs(f):
            f = os.path.join(root, f)
        if f in seen:
            continue
        seen.add(f)
        line = m.group("line")
        href = f"vscode://file/{f}" + (f":{line}" if line else "")
        start = max(0, m.start())
        snippet = text[start:start + 160].split("\n")[0]
        out.append((snippet, f, href))
    return out


# ── Test result parser (vitest verbose / pytest) ───────────────────────────────

def _parse_test_results(log_text: str) -> Optional[dict]:
    """Extract pass/fail counts from vitest or pytest output."""
    text = _strip(log_text)
    # vitest: "Tests  N passed (N)" or "N passed | N failed"
    m = re.search(r'(\d+)\s+passed', text)
    f = re.search(r'(\d+)\s+failed', text)
    if m or f:
        return {"passed": int(m.group(1)) if m else 0, "failed": int(f.group(1)) if f else 0}
    # pytest: "N passed, N failed"
    m2 = re.search(r'(\d+) passed', text)
    f2 = re.search(r'(\d+) failed', text)
    if m2 or f2:
        return {"passed": int(m2.group(1)) if m2 else 0, "failed": int(f2.group(1)) if f2 else 0}
    return None


# ── CSS ────────────────────────────────────────────────────────────────────────

_CSS = """\
*,*::before,*::after{box-sizing:border-box}
:root{font-family:system-ui,-apple-system,sans-serif;
  --bg:#0f172a;--card:#1e293b;--border:#334155;--muted:#64748b;--text:#e2e8f0;
  --pass:#4ade80;--fail:#f87171;--skip:#94a3b8;--warn:#fbbf24;--link:#60a5fa}
body{margin:0;background:var(--bg);color:var(--text)}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--border);
  padding:16px 28px;display:flex;align-items:center;gap:12px}
header h1{margin:0;font-size:18px;font-weight:700;flex:1}
.hbadge{padding:4px 14px;border-radius:99px;font-size:12px;font-weight:700}
.hbadge.pass{background:#14532d;color:var(--pass)}.hbadge.fail{background:#7f1d1d;color:var(--fail)}
.meta{color:var(--muted);font-size:11px;margin-top:2px}
.back{font-size:12px;color:var(--link);margin-right:10px}
main{max-width:1060px;margin:0 auto;padding:20px 28px}
.summary{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap}
.sc{flex:1;min-width:100px;background:var(--card);border:1px solid var(--border);
  border-radius:9px;padding:13px 16px;text-align:center}
.sc .n{font-size:32px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.sc .l{font-size:10px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
.n.p{color:var(--pass)}.n.f{color:var(--fail)}.n.s{color:var(--skip)}.n.t{color:var(--muted)}
.step{background:var(--card);border:1px solid var(--border);border-radius:9px;
  margin-bottom:10px}
.step-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;
  cursor:pointer;user-select:none;border-radius:9px}
.step-hdr:hover{background:#273548}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.dot.pass{background:var(--pass)}.dot.fail{background:var(--fail);box-shadow:0 0 5px var(--fail)}
.dot.skip{background:var(--skip)}
.sname{font-weight:600;font-size:13.5px;flex:1}
.slabel{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-right:4px}
.slabel.pass{background:#14532d44;color:var(--pass)}
.slabel.fail{background:#7f1d1d44;color:var(--fail)}
.slabel.skip{background:#1e293b;color:var(--skip)}
.chevron{font-size:11px;color:var(--muted)}
.step-body{display:none;border-top:1px solid var(--border);border-radius:0 0 9px 9px}
.step-body.open{display:block}
.test-bar{display:flex;align-items:center;gap:10px;padding:8px 16px;
  background:#0d1b2a;border-bottom:1px solid var(--border);font-size:12px}
.test-bar .tp{color:var(--pass)}.test-bar .tf{color:var(--fail)}
.issues{padding:9px 16px;background:#1a0f0f;border-bottom:1px solid #3d1515}
.issues h4{margin:0 0 6px;font-size:11px;color:var(--fail);text-transform:uppercase;letter-spacing:.05em}
.issue{font-size:11px;padding:5px 8px;background:#1f1010;border-radius:4px;
  border-left:3px solid var(--fail);margin-bottom:4px}
pre.log{margin:0;padding:12px 16px;font-size:11px;line-height:1.65;
  white-space:pre-wrap;word-break:break-all;background:var(--bg);color:var(--muted);
  max-height:440px;overflow-y:auto}
pre.log .e{color:var(--fail)}pre.log .w{color:var(--warn)}pre.log .g{color:var(--pass)}
a.fl{color:var(--link)}
.stress-tag{font-size:10px;color:#a5b4fc;background:#1e1b4b;
  padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
footer{text-align:center;color:var(--border);font-size:11px;padding:24px}
"""

_IDX_CSS = """\
*,*::before,*::after{box-sizing:border-box}
:root{font-family:system-ui,-apple-system,sans-serif;
  --bg:#0f172a;--card:#1e293b;--border:#334155;--muted:#64748b;--text:#e2e8f0;
  --pass:#4ade80;--fail:#f87171;--skip:#94a3b8;--link:#60a5fa}
body{margin:0;background:var(--bg);color:var(--text)}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--border);padding:16px 28px}
header h1{margin:0;font-size:18px;font-weight:700}
header p{margin:3px 0 0;color:var(--muted);font-size:11px}
.back{font-size:11px;display:block;margin-bottom:14px;color:var(--link)}
main{max-width:820px;margin:0 auto;padding:20px 28px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;padding:6px 10px;color:var(--muted);font-weight:600;font-size:10px;
  border-bottom:2px solid var(--border);text-transform:uppercase;letter-spacing:.05em}
td{padding:9px 10px;border-bottom:1px solid #1e293b;vertical-align:middle}
tr:hover td{background:var(--card)}
.b{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
.b.pass{background:#14532d44;color:var(--pass)}.b.fail{background:#7f1d1d44;color:var(--fail)}
.stress{font-size:9px;color:#a5b4fc;background:#1e1b4b;padding:1px 5px;border-radius:3px;margin-left:4px}
.num{font-variant-numeric:tabular-nums}
.section-card{background:var(--card);border:1px solid var(--border);border-radius:10px;
  margin-bottom:20px;overflow:hidden}
.section-card h2{margin:0;padding:13px 16px;font-size:14px;font-weight:700;
  border-bottom:1px solid var(--border)}
.section-card table{font-size:12px}
footer{text-align:center;color:var(--border);font-size:10px;padding:24px}
"""

_TOP_CSS = """\
*,*::before,*::after{box-sizing:border-box}
:root{font-family:system-ui,-apple-system,sans-serif;
  --bg:#0f172a;--card:#1e293b;--border:#334155;--muted:#64748b;--text:#e2e8f0;
  --pass:#4ade80;--fail:#f87171;--link:#60a5fa}
body{margin:0;background:var(--bg);color:var(--text)}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--border);padding:18px 32px}
header h1{margin:0;font-size:20px;font-weight:700}
header p{margin:4px 0 0;color:var(--muted);font-size:12px}
main{max-width:760px;margin:0 auto;padding:24px 32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:32px}
.scard{background:var(--card);border:1px solid var(--border);border-radius:12px;
  padding:20px 22px;display:flex;flex-direction:column;gap:8px}
.scard h2{margin:0;font-size:15px;font-weight:700}
.scard p{margin:0;font-size:11px;color:var(--muted);flex:1}
.scard a.btn{display:inline-block;padding:6px 14px;border-radius:6px;font-size:12px;
  font-weight:600;background:#1e40af;color:#fff;margin-top:4px;text-align:center}
.scard a.btn:hover{background:#2563eb;text-decoration:none}
.latest{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 20px}
.latest h2{margin:0 0 12px;font-size:14px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:5px 10px;color:var(--muted);font-size:10px;
  text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid var(--border)}
td{padding:8px 10px;border-bottom:1px solid #1e293b}
tr:hover td{background:#273548}
.b{display:inline-block;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700}
.b.pass{background:#14532d44;color:var(--pass)}.b.fail{background:#7f1d1d44;color:var(--fail)}
footer{text-align:center;color:var(--border);font-size:11px;padding:28px}
"""


# ── Step HTML ──────────────────────────────────────────────────────────────────

def _step_html(name: str, status: str, log_path: str, root: str, idx: int) -> str:
    log_text = ""
    if log_path and Path(log_path).exists():
        try:
            log_text = Path(log_path).read_text(errors="replace")
        except OSError:
            log_text = "(log unavailable)"

    test_results = _parse_test_results(log_text) if log_text else None
    issues = _file_issues(log_text, root) if status == "fail" else []
    colorized = _colorize(root, log_text) if log_text else "(no output)"

    test_bar = ""
    if test_results:
        tp = test_results["passed"]
        tf = test_results["failed"]
        test_bar = (
            f'<div class="test-bar">'
            f'<span class="tp">✓ {tp} passed</span>'
            + (f'<span class="tf">✗ {tf} failed</span>' if tf else "")
            + '</div>'
        )

    issues_html = ""
    if issues:
        rows = "".join(
            f'<div class="issue"><a class="fl" href="{_html.escape(href)}">'
            f'{_html.escape(Path(f).name)}</a>'
            f' &mdash; {_html.escape(snip[:120])}</div>'
            for snip, f, href in issues
        )
        issues_html = f'<div class="issues"><h4>⚠ Files with issues</h4>{rows}</div>'

    return (
        f'<div class="step" id="s{idx}">'
        f'<div class="step-hdr" onclick="toggle({idx})">'
        f'<div class="dot {status}"></div>'
        f'<span class="sname">{_html.escape(name)}</span>'
        f'<span class="slabel {status}">{status.upper()}</span>'
        f'<span class="chevron" id="c{idx}">▶</span>'
        f'</div>'
        f'<div class="step-body" id="b{idx}">{test_bar}{issues_html}'
        f'<pre class="log">{colorized}</pre></div>'
        f'</div>\n'
    )


# ── Subfolder index ────────────────────────────────────────────────────────────

def _subfolder_label(subdir: str) -> str:
    return {"local": "Local (with Deck)", "ci": "CI / Automated", "release": "Release"}. \
        get(subdir, subdir.title())


def _rebuild_subfolder_index(subdir_path: Path) -> List[dict]:
    """Rebuild index.html for one subfolder. Returns list of meta dicts."""
    metas = sorted(
        [f for f in subdir_path.glob("*.json") if not f.name.startswith(("_", "."))],
        key=lambda f: f.stem,
        reverse=True,
    )
    records = []
    for p in metas:
        try:
            m = json.loads(p.read_text())
            records.append(m)
        except Exception:
            continue

    rows = []
    for m in records:
        ts      = m.get("ts", "?")
        overall = m.get("overall", "?").lower()
        passed  = m.get("passed",  0)
        failed  = m.get("failed",  0)
        skipped = m.get("skipped", 0)
        total   = m.get("total",   0)
        stress  = m.get("stress",  False)
        try:
            dt = datetime.strptime(ts, "%Y-%m-%d_%H-%M-%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            dt = ts
        f_html = Path(ts + ".html").name
        stag = '<span class="stress">stress</span>' if stress else ""
        rows.append(
            f'<tr>'
            f'<td>{_html.escape(dt)}{stag}</td>'
            f'<td><span class="b {overall}">{overall.upper()}</span></td>'
            f'<td class="num" style="color:var(--pass)">{passed}</td>'
            f'<td class="num" style="color:var(--fail)">{failed}</td>'
            f'<td class="num" style="color:var(--skip)">{skipped}</td>'
            f'<td class="num" style="color:var(--muted)">{total}</td>'
            f'<td><a href="{_html.escape(f_html)}">view &rarr;</a></td>'
            f'</tr>'
        )

    body = "\n".join(rows) if rows else (
        '<tr><td colspan="7" style="color:#475569;padding:20px 10px">No reports yet.</td></tr>'
    )
    label = _subfolder_label(subdir_path.name)
    idx_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; {_html.escape(label)} Reports</title>
<style>{_IDX_CSS}</style>
</head>
<body>
<header>
  <h1>Deck Shelves &mdash; {_html.escape(label)}</h1>
  <p>{len(records)} run(s) &nbsp;&middot;&nbsp; newest first</p>
</header>
<main>
<a class="back" href="../index.html">&larr; All reports</a>
<table>
  <thead><tr>
    <th>Date / Time</th><th>Result</th>
    <th>Pass</th><th>Fail</th><th>Skip</th><th>Total</th><th></th>
  </tr></thead>
  <tbody>{body}</tbody>
</table>
</main>
<footer>Deck Shelves CI &middot; {_html.escape(label)}</footer>
</body>
</html>
"""
    (subdir_path / "index.html").write_text(idx_html, encoding="utf-8")
    return records


# ── Top-level index ────────────────────────────────────────────────────────────

def _rebuild_top_index(reports_root: Path) -> None:
    subdirs = ["local", "ci", "release"]
    labels  = {"local": "Local", "ci": "CI / Automated", "release": "Release"}
    descs   = {
        "local":   "Full validation with Steam Deck (deploy + UI tests + perf bench).",
        "ci":      "Automated checks without device (typecheck, tests, build, compat).",
        "release": "Release gate: CI checks + packaging + security audit.",
    }

    # Latest run per subdir
    latest_rows = []
    section_cards = []
    for sd in subdirs:
        sp = reports_root / sd
        sp.mkdir(exist_ok=True)
        metas = sorted(sp.glob("*.json"), key=lambda f: f.stem, reverse=True)
        last = None
        for p in metas:
            try:
                last = json.loads(p.read_text())
                break
            except Exception:
                pass
        if last:
            ts      = last.get("ts", "?")
            overall = last.get("overall", "?").lower()
            passed  = last.get("passed", 0)
            failed  = last.get("failed", 0)
            total   = last.get("total",  0)
            try:
                dt = datetime.strptime(ts, "%Y-%m-%d_%H-%M-%S").strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                dt = ts
            latest_rows.append(
                f'<tr>'
                f'<td>{_html.escape(labels[sd])}</td>'
                f'<td>{_html.escape(dt)}</td>'
                f'<td><span class="b {overall}">{overall.upper()}</span></td>'
                f'<td class="num">{passed}/{total}</td>'
                f'<td><a href="{sd}/index.html">history &rarr;</a></td>'
                f'</tr>'
            )
        else:
            latest_rows.append(
                f'<tr><td>{_html.escape(labels[sd])}</td>'
                f'<td colspan="4" style="color:var(--muted)">No runs yet &nbsp;'
                f'&mdash;&nbsp; <a href="{sd}/index.html">open &rarr;</a></td></tr>'
            )

        section_cards.append(
            f'<div class="scard">'
            f'<h2>{_html.escape(labels[sd])}</h2>'
            f'<p>{_html.escape(descs[sd])}</p>'
            f'<a class="btn" href="{sd}/index.html">Open reports &rarr;</a>'
            f'</div>'
        )

    latest_body = "\n".join(latest_rows)
    cards_html  = "\n".join(section_cards)

    top = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; Validation Reports</title>
<style>{_TOP_CSS}</style>
</head>
<body>
<header>
  <h1>Deck Shelves &mdash; Validation Reports</h1>
  <p>Three validation scopes &middot; local-only, not committed</p>
</header>
<main>
  <div class="grid">
{cards_html}
  </div>
  <div class="latest">
    <h2>Latest run per scope</h2>
    <table>
      <thead><tr>
        <th>Scope</th><th>Date / Time</th><th>Result</th><th>Pass / Total</th><th></th>
      </tr></thead>
      <tbody>{latest_body}</tbody>
    </table>
  </div>
</main>
<footer>Deck Shelves CI &middot; local-only</footer>
</body>
</html>
"""
    (reports_root / "index.html").write_text(top, encoding="utf-8")


# ── Report generation ──────────────────────────────────────────────────────────

def generate(
    ts: str,
    stress: bool,
    subdir: str,
    names: List[str],
    statuses: List[str],
    logs: List[str],
    out_path: str,
    root: str,
) -> None:
    passed  = statuses.count("pass")
    failed  = statuses.count("fail")
    skipped = statuses.count("skip")
    total   = len(statuses)
    overall = "pass" if failed == 0 else "fail"

    try:
        dt_str = datetime.strptime(ts, "%Y-%m-%d_%H-%M-%S").strftime("%B %d, %Y at %H:%M:%S")
    except ValueError:
        dt_str = ts

    scope_label = _subfolder_label(subdir)
    stress_tag = '<span class="stress-tag">stress</span>' if stress else ""

    steps_html = "".join(
        _step_html(n, s, l, root, i)
        for i, (n, s, l) in enumerate(zip(names, statuses, logs))
    )

    report = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; {_html.escape(scope_label)} {_html.escape(ts)}</title>
<style>{_CSS}</style>
</head>
<body>
<header>
  <a class="back" href="index.html">&larr;</a>
  <div style="flex:1">
    <h1>Deck Shelves &mdash; {_html.escape(scope_label)}{stress_tag}</h1>
    <div class="meta">{_html.escape(dt_str)} &nbsp;&middot;&nbsp; {total} steps</div>
  </div>
  <span class="hbadge {overall}">{"PASS" if overall == "pass" else "FAIL"}</span>
</header>
<main>
  <div class="summary">
    <div class="sc"><div class="n p">{passed}</div><div class="l">Passed</div></div>
    <div class="sc"><div class="n f">{failed}</div><div class="l">Failed</div></div>
    <div class="sc"><div class="n s">{skipped}</div><div class="l">Skipped</div></div>
    <div class="sc"><div class="n t">{total}</div><div class="l">Total</div></div>
  </div>
{steps_html}
</main>
<footer>Deck Shelves CI &middot; {_html.escape(ts)}</footer>
<script>
function toggle(i){{
  var b=document.getElementById('b'+i);
  var c=document.getElementById('c'+i);
  var open=b.classList.toggle('open');
  c.textContent=open?'▼':'▶';
}}
</script>
</body>
</html>
"""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")

    meta = {
        "ts": ts, "stress": stress, "subdir": subdir,
        "overall": overall.upper(),
        "passed": passed, "failed": failed, "skipped": skipped, "total": total,
    }
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Rebuild indexes
    _rebuild_subfolder_index(out.parent)
    _rebuild_top_index(out.parent.parent)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ts",         required=True)
    p.add_argument("--stress",     required=True)
    p.add_argument("--subdir",     required=True)
    p.add_argument("--tmp",        required=True)
    p.add_argument("--out",        required=True)
    p.add_argument("--root",       required=True)
    p.add_argument("--steps-json", required=True, dest="steps_json")
    args = p.parse_args()

    try:
        data = json.loads(Path(args.steps_json).read_text())
    except Exception as e:
        print(f"report.py: could not read steps-json: {e}", file=sys.stderr)
        data = {}

    names    = data.get("names",    [])
    statuses = data.get("statuses", [])
    logs     = data.get("logs",     [])
    while len(logs) < len(names):
        logs.append("")

    generate(
        ts=args.ts, stress=args.stress == "1", subdir=args.subdir,
        names=names, statuses=statuses, logs=logs,
        out_path=args.out, root=args.root,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
