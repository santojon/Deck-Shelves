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
    m = re.search(r'(\d+)\s+passed', text)
    f = re.search(r'(\d+)\s+failed', text)
    if m or f:
        return {"passed": int(m.group(1)) if m else 0, "failed": int(f.group(1)) if f else 0}
    m2 = re.search(r'(\d+) passed', text)
    f2 = re.search(r'(\d+) failed', text)
    if m2 or f2:
        return {"passed": int(m2.group(1)) if m2 else 0, "failed": int(f2.group(1)) if f2 else 0}
    return None


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
.sdur{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;margin-right:6px}
.panel{background:var(--card);border:1px solid var(--border);border-radius:9px;padding:14px 16px;margin-bottom:18px}
.panel h2{margin:0 0 12px;font-size:13px;font-weight:700;color:var(--text)}
.bm{display:flex;flex-direction:column;gap:6px}
.bm-row{display:grid;grid-template-columns:minmax(120px,1fr) 3fr 70px;align-items:center;gap:10px;font-size:11.5px}
.bm-name{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bm-bar-wrap{background:#0d1b2a;border-radius:4px;height:10px;overflow:hidden}
.bm-bar{height:100%;border-radius:4px;transition:width .2s ease}
.bm-dur{color:var(--muted);font-variant-numeric:tabular-nums;text-align:right}
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

def _step_html(name: str, status: str, log_path: str, root: str, idx: int, duration_ms: int = 0) -> str:
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

    dur_html = (
        f'<span class="sdur" title="{duration_ms} ms">{_fmt_duration_ms(duration_ms)}</span>'
        if duration_ms and duration_ms > 0 else ""
    )
    return (
        f'<div class="step" id="s{idx}">'
        f'<div class="step-hdr" onclick="toggle({idx})">'
        f'<div class="dot {status}"></div>'
        f'<span class="sname">{_html.escape(name)}</span>'
        f'{dur_html}'
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
        [f for f in subdir_path.glob("*.json")
         if not f.name.startswith(("_", "."))
         and f.name != "runs-manifest.json"],
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

    # Write a manifest listing every run in this scope, full metadata inline.
    # The dashboard's client-side JS fetches this at view time and merges with
    # whatever was baked into the page, so a CI-committed dashboard still picks
    # up locally-generated runs when opened on the contributor's machine.
    try:
        manifest = [{**m, "_scope": subdir_path.name} for m in records]
        (subdir_path / "runs-manifest.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
    except OSError:
        pass

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
        metas = sorted(
            [f for f in sp.glob("*.json") if f.name != "runs-manifest.json"],
            key=lambda f: f.stem,
            reverse=True,
        )
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
            last.get("failed", 0)
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

    # Mirror the dashboard's client-side augmentation: server-rendered table
    # is the fallback (file:// in Chromium blocks fetch), JS replaces each
    # row with whatever the live runs-manifest reports. Without this, a
    # CI-committed index always shows "No runs yet" for local on the
    # contributor's machine even though their local manifest is right there.
    top_js = r"""
(function(){
  const SCOPES=[['local','Local'],['ci','CI / Automated'],['release','Release']];
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function fmt(ts){
    const m=/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/.exec(ts||'');
    return m?`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`:(ts||'?');
  }
  Promise.all(SCOPES.map(([sd])=>fetch(sd+'/runs-manifest.json',{cache:'no-cache'})
    .then(r=>r.ok?r.json():[]).catch(()=>[])))
  .then(lists=>{
    const tbody=document.querySelector('.latest tbody');
    if(!tbody)return;
    const rows=SCOPES.map(([sd,label],i)=>{
      const runs=lists[i]||[];
      if(!runs.length){
        return `<tr><td>${esc(label)}</td><td colspan="4" style="color:var(--muted)">No runs yet &nbsp;&mdash;&nbsp; <a href="${sd}/index.html">open &rarr;</a></td></tr>`;
      }
      runs.sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')));
      const last=runs[0];
      const overall=String(last.overall||'?').toLowerCase();
      return `<tr><td>${esc(label)}</td><td>${esc(fmt(last.ts))}</td>`+
             `<td><span class="b ${overall}">${overall.toUpperCase()}</span></td>`+
             `<td class="num">${last.passed||0}/${last.total||0}</td>`+
             `<td><a href="${sd}/index.html">history &rarr;</a></td></tr>`;
    });
    tbody.innerHTML=rows.join('');
  });
})();
""".strip()

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
  <p>Three validation scopes + dashboard &middot; local-only, not committed</p>
</header>
<main>
  <div style="margin-bottom:20px">
    <a class="btn" href="dashboard.html"
       style="display:inline-block;padding:9px 18px;border-radius:8px;font-size:13px;
              font-weight:700;background:#7c3aed;color:#fff">📊 Open Dashboard &rarr;</a>
  </div>
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
<script>{top_js}</script>
</body>
</html>
"""
    (reports_root / "index.html").write_text(top, encoding="utf-8")


# ── Dashboard ──────────────────────────────────────────────────────────────────

_DASH_CSS = """\
*,*::before,*::after{box-sizing:border-box}
:root{font-family:system-ui,-apple-system,sans-serif;
  --bg:#0f172a;--card:#1e293b;--border:#334155;--muted:#64748b;--text:#e2e8f0;
  --pass:#4ade80;--fail:#f87171;--skip:#94a3b8;--link:#60a5fa;--accent:#a78bfa}
body{margin:0;background:var(--bg);color:var(--text)}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--border);padding:18px 32px;
  display:flex;align-items:center;gap:14px}
header h1{margin:0;font-size:20px;font-weight:700;flex:1}
.back{font-size:12px;color:var(--link)}
main{max-width:1080px;margin:0 auto;padding:24px 32px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:26px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px}
.kpi .v{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.kpi .l{font-size:11px;color:var(--muted);margin-top:6px;text-transform:uppercase;letter-spacing:.05em}
.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;
  padding:18px 22px;margin-bottom:20px}
.panel h2{margin:0 0 14px;font-size:14px;font-weight:700}
.panel-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:720px){.panel-grid{grid-template-columns:1fr}}
.legend{display:flex;gap:16px;font-size:11px;color:var(--muted);margin-top:10px;flex-wrap:wrap}
.legend span{display:flex;align-items:center;gap:5px}
.legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.scope-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:12px}
.scope-row .nm{width:90px;color:var(--muted)}
.bar{flex:1;height:22px;border-radius:5px;overflow:hidden;display:flex;background:#0f172a}
.bar i{display:block;height:100%}
.scope-row .ct{width:70px;text-align:right;font-variant-numeric:tabular-nums;font-size:11px}
footer{text-align:center;color:var(--border);font-size:11px;padding:28px}
text{font-family:system-ui,sans-serif}
.filter-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}
.filter-chips button{background:var(--card);border:1px solid var(--border);color:var(--muted);
  padding:6px 14px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;
  transition:all .12s ease}
.filter-chips button:hover{color:var(--text);border-color:var(--muted)}
.filter-chips button.active{background:var(--accent);border-color:var(--accent);color:#0f172a}
.scope-view[hidden]{display:none}
.empty-scope{color:#475569;font-size:12px;text-align:center;padding:24px}
"""


_STEP_BODY_RE  = re.compile(r'id="b(\d+)">(.*?)</div>\s*</div>', re.DOTALL)
_PRE_RE        = re.compile(r'<pre[^>]*>(.*?)</pre>', re.DOTALL)
_TAG_RE        = re.compile(r'<[^>]+>')
_ENTITY_MAP    = {"&gt;": ">", "&lt;": "<", "&amp;": "&", "&#x27;": "'", "&quot;": '"'}

def _html_to_text(h: str) -> str:
    t = _TAG_RE.sub("", h)
    for ent, ch in _ENTITY_MAP.items():
        t = t.replace(ent, ch)
    return t


def _backfill_per_suite(meta: dict, json_path: Path) -> None:
    """If per_suite is missing, try to extract it from the corresponding HTML."""
    if meta.get("per_suite"):
        return
    html_path = json_path.with_suffix(".html")
    if not html_path.exists():
        return
    try:
        html = html_path.read_text(errors="replace")
        # Find the step name for each body
        names_in_html = re.findall(r'class="sname">([^<]+)', html)
        for i, step_name in enumerate(names_in_html):
            if "ui test" not in step_name.lower():
                continue
            body_m = re.search(rf'id="b{i}">(.*?)</div>\s*</div>', html, re.DOTALL)
            if not body_m:
                continue
            pre_m = re.search(r'<pre[^>]*>(.*?)</pre>', body_m.group(1), re.DOTALL)
            if not pre_m:
                continue
            log_text = _html_to_text(pre_m.group(1))
            by_suite = _parse_uitests_by_suite(log_text)
            if by_suite:
                meta["per_suite"] = by_suite
                # Persist back to JSON so next rebuild is instant
                json_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
            break
    except Exception:
        pass


def _collect_all_runs(reports_root: Path) -> List[dict]:
    """Gather every run's metadata across all three scopes, sorted by ts.
    Retroactively backfills per_suite from HTML when missing in the JSON."""
    runs: List[dict] = []
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if not sp.exists():
            continue
        for p in sp.glob("*.json"):
            if p.name.startswith((".", "_")) or p.name == "runs-manifest.json":
                continue
            try:
                m = json.loads(p.read_text())
                m["_scope"] = sd
                _backfill_per_suite(m, p)
                runs.append(m)
            except Exception:
                pass
    runs.sort(key=lambda m: m.get("ts", ""))
    return runs


def _svg_line_chart(runs: List[dict], w: int = 480, h: int = 200) -> str:
    """Line chart of pass-rate % per run over time."""
    if not runs:
        return '<p style="color:#475569;font-size:12px">No data yet.</p>'
    pad_l, pad_b, pad_t, pad_r = 34, 24, 12, 12
    cw, ch = w - pad_l - pad_r, h - pad_t - pad_b
    pts = []
    for i, m in enumerate(runs):
        total = m.get("total", 0) or 1
        rate = 100.0 * m.get("passed", 0) / total
        x = pad_l + (cw * i / max(1, len(runs) - 1))
        y = pad_t + ch - (ch * rate / 100.0)
        pts.append((x, y, rate, m))
    # Grid lines + labels (0/50/100%)
    grid = []
    for pct in (0, 50, 100):
        gy = pad_t + ch - (ch * pct / 100.0)
        grid.append(f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{w-pad_r}" y2="{gy:.1f}" '
                    f'stroke="#334155" stroke-width="1"/>')
        grid.append(f'<text x="{pad_l-6}" y="{gy+3:.1f}" fill="#64748b" font-size="9" '
                    f'text-anchor="end">{pct}%</text>')
    # Area + line
    line_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y, _, _ in pts)
    area_d = (f"M{pts[0][0]:.1f},{pad_t+ch} L"
              + " L".join(f"{x:.1f},{y:.1f}" for x, y, _, _ in pts)
              + f" L{pts[-1][0]:.1f},{pad_t+ch} Z")
    dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" '
        f'fill="{"#4ade80" if m.get("failed",0)==0 else "#f87171"}">'
        f'<title>{_html.escape(m.get("ts","?"))} [{m.get("_scope","?")}] '
        f'{rate:.0f}% ({m.get("passed",0)}/{m.get("total",0)})</title></circle>'
        for x, y, rate, m in pts
    )
    return f"""<svg viewBox="0 0 {w} {h}" width="100%" height="{h}">
{''.join(grid)}
<path d="{area_d}" fill="#7c3aed22"/>
<path d="{line_d}" fill="none" stroke="#a78bfa" stroke-width="2"/>
{dots}
</svg>"""


def _svg_donut(passed: int, failed: int, skipped: int, size: int = 180) -> str:
    """Donut chart of overall pass/fail/skip distribution."""
    total = passed + failed + skipped
    if total == 0:
        return '<p style="color:#475569;font-size:12px">No data yet.</p>'
    cx = cy = size / 2
    r = size / 2 - 14
    import math
    segs = [("#4ade80", passed), ("#f87171", failed), ("#94a3b8", skipped)]
    arcs = []
    angle = -90.0
    for color, val in segs:
        if val == 0:
            continue
        frac = val / total
        sweep = frac * 360.0
        # 100%-single-bucket case: a full 360° arc has its start point equal
        # to its end point, which the SVG `<path A>` spec treats as a zero
        # arc — nothing renders, the donut shows only the percent text. Emit
        # a `<circle>` instead so the ring is visible at 100% pass/fail/skip.
        if sweep >= 359.999:
            arcs.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r:.2f}" '
                f'fill="none" stroke="{color}" stroke-width="22"/>'
            )
            angle += sweep
            continue
        a1 = math.radians(angle)
        a2 = math.radians(angle + sweep)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        large = 1 if sweep > 180 else 0
        arcs.append(
            f'<path d="M{x1:.2f},{y1:.2f} A{r:.2f},{r:.2f} 0 {large} 1 {x2:.2f},{y2:.2f}" '
            f'fill="none" stroke="{color}" stroke-width="22"/>'
        )
        angle += sweep
    pct = round(100.0 * passed / total)
    return f"""<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}">
{''.join(arcs)}
<text x="{cx}" y="{cy-2}" fill="#e2e8f0" font-size="26" font-weight="800"
      text-anchor="middle">{pct}%</text>
<text x="{cx}" y="{cy+16}" fill="#64748b" font-size="10" text-anchor="middle">PASS RATE</text>
</svg>"""


def _scope_bars(runs: List[dict]) -> str:
    """Horizontal stacked bars: pass/fail/skip totals per scope."""
    rows = []
    for sd, label in (("local", "Local"), ("ci", "CI"), ("release", "Release")):
        sr = [m for m in runs if m.get("_scope") == sd]
        p = sum(m.get("passed", 0) for m in sr)
        f = sum(m.get("failed", 0) for m in sr)
        k = sum(m.get("skipped", 0) for m in sr)
        tot = p + f + k
        if tot == 0:
            rows.append(
                f'<div class="scope-row"><span class="nm">{label}</span>'
                f'<div class="bar"></div><span class="ct" style="color:#475569">—</span></div>'
            )
            continue
        pp, fp, kp = 100*p/tot, 100*f/tot, 100*k/tot
        rows.append(
            f'<div class="scope-row"><span class="nm">{label}</span>'
            f'<div class="bar">'
            f'<i style="width:{pp:.1f}%;background:#4ade80"></i>'
            f'<i style="width:{fp:.1f}%;background:#f87171"></i>'
            f'<i style="width:{kp:.1f}%;background:#94a3b8"></i>'
            f'</div>'
            f'<span class="ct">{p}/{tot}</span></div>'
        )
    return "".join(rows)


def _suite_coverage_bars(runs: List[dict]) -> str:
    """Per-suite stacked bars aggregated across all runs that have per_suite data."""
    # Known suites in display order
    SUITES = [
        ("home",             "Home"),
        ("qam_shelves",      "QAM Shelves"),
        ("qam_smart",        "QAM Smart"),
        ("qam_global_toggles","QAM Global"),
        ("about",            "About"),
        ("context_menu",     "Context Menu"),
        ("perf",             "Performance"),
        ("crash_protection", "Crash Protection"),
        ("stress",           "Stress"),
    ]
    # Aggregate across all runs
    totals: dict = {}
    runs_with_suites = [m for m in runs if m.get("per_suite")]
    for m in runs_with_suites:
        for suite, counts in (m.get("per_suite") or {}).items():
            s = totals.setdefault(suite, {"passed": 0, "failed": 0, "skipped": 0})
            s["passed"]  += counts.get("passed",  0)
            s["failed"]  += counts.get("failed",  0)
            s["skipped"] += counts.get("skipped", 0)

    if not totals:
        return '<p style="color:#475569;font-size:12px">No UI test data yet. Run <code>pnpm validate:full</code> with a Deck connected.</p>'

    rows = []
    for key, label in SUITES:
        s = totals.get(key)
        if not s:
            continue
        tot = s["passed"] + s["failed"] + s["skipped"]
        if tot == 0:
            continue
        pp = 100 * s["passed"]  / tot
        fp = 100 * s["failed"]  / tot
        kp = 100 * s["skipped"] / tot
        pct_pass = round(100 * s["passed"] / tot)
        color = "#4ade80" if s["failed"] == 0 else ("#f87171" if s["passed"] == 0 else "#fbbf24")
        rows.append(
            f'<div class="scope-row">'
            f'<span class="nm" title="{key}">{label}</span>'
            f'<div class="bar">'
            f'<i style="width:{pp:.1f}%;background:#4ade80"></i>'
            f'<i style="width:{fp:.1f}%;background:#f87171"></i>'
            f'<i style="width:{kp:.1f}%;background:#94a3b8"></i>'
            f'</div>'
            f'<span class="ct" style="color:{color}">{pct_pass}%</span>'
            f'</div>'
        )
    return "".join(rows) if rows else '<p style="color:#475569;font-size:12px">No suite data.</p>'


def _context_pills(runs: List[dict]) -> str:
    """Stats: runs with/without Deck and with/without stress fixture."""
    total = len(runs)
    if total == 0:
        return ""
    with_deck   = sum(1 for m in runs if m.get("subdir") == "local")
    without_deck = total - with_deck
    with_stress = sum(1 for m in runs if m.get("stress"))
    items = [
        ("with Deck",    with_deck,    "#60a5fa"),
        ("without Deck", without_deck, "#818cf8"),
        ("with stress",  with_stress,  "#f59e0b"),
        ("no stress",    total - with_stress, "#6b7280"),
    ]
    pills = "".join(
        f'<span style="background:{c}22;color:{c};border:1px solid {c}44;'
        f'padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap">'
        f'{n} <b>{v}</b></span>'
        for (n, v, c) in items
    )
    return f'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">{pills}</div>'


_DASH_JS = r"""
(function(){
  const SCOPES=['local','ci','release'];
  const PASS='#4ade80',FAIL='#f87171',SKIP='#94a3b8';
  const $=id=>document.getElementById(id);
  let runs=Array.isArray(window.__BAKED_RUNS__)?window.__BAKED_RUNS__:[];
  let currentScope='all', currentDeck='all', currentStress='all';

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function scopeOf(r){return r._scope||r.scope||''}
  function hasDeck(r){return scopeOf(r)==='local'}
  function hasStress(r){return !!r.stress}
  function filterRuns(rs,sc,dk,st){
    return rs.filter(r=>
      (sc==='all'||scopeOf(r)===sc) &&
      (dk==='all'||(dk==='yes'?hasDeck(r):!hasDeck(r))) &&
      (st==='all'||(st==='yes'?hasStress(r):!hasStress(r)))
    );
  }
  function sortRuns(rs){return rs.slice().sort((a,b)=>String(a.ts||'').localeCompare(String(b.ts||'')))}
  function dedupe(rs){const m=new Map();for(const r of rs){const k=(r.ts||'')+'|'+scopeOf(r);if(!m.has(k))m.set(k,r);}return Array.from(m.values())}

  function pills(rs){
    // Counts ALWAYS reflect the full runs array (not the current filter
    // view) so the pills never vanish when a filter combination ends up
    // empty — the user must be able to click the active pill again to
    // reverse out of a zero-result state. The active styling still tracks
    // currentDeck / currentStress so the UI shows what's selected.
    const total=rs.length;
    const withDeck=rs.filter(r=>scopeOf(r)==='local').length;
    const stress=rs.filter(r=>r.stress).length;
    // The pills double as filter toggles. `axis` (deck|stress) and `value`
    // (yes|no) map to currentDeck/currentStress; clicking re-runs render()
    // with the new filter (toggle off if already active). Visual state =
    // a brighter background + thicker border when active.
    const items=[
      ['with Deck',   withDeck,        '#60a5fa','deck',  'yes'],
      ['without Deck',total-withDeck,  '#818cf8','deck',  'no'],
      ['with stress', stress,          '#f59e0b','stress','yes'],
      ['no stress',   total-stress,    '#6b7280','stress','no'],
    ];
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">'+
      items.map(([n,v,c,axis,val])=>{
        const active=(axis==='deck'&&currentDeck===val)||(axis==='stress'&&currentStress===val);
        const bg=active?(c+'55'):(c+'22');
        const border=active?(c+'cc'):(c+'44');
        return `<button type="button" data-pill-axis="${axis}" data-pill-value="${val}" `+
          `style="background:${bg};color:${c};border:1px solid ${border};padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer;${active?'box-shadow:0 0 0 1px '+c+'66;':''}">`+
          `${esc(n)} <b>${v}</b></button>`;
      }).join('')+
      '</div>';
  }

  function fmtDur(ms){
    if(!ms||ms<0)return '—';
    if(ms<1000)return ms+' ms';
    const s=ms/1000;
    if(s<60)return s.toFixed(1)+'s';
    const m=Math.floor(s/60),rem=Math.round(s-m*60);
    if(m<60)return m+'m '+rem+'s';
    const h=Math.floor(m/60);
    return h+'h '+(m-h*60)+'m';
  }

  function kpis(rs){
    const total=rs.length;
    const p=rs.reduce((a,r)=>a+(r.passed||0),0);
    const f=rs.reduce((a,r)=>a+(r.failed||0),0);
    const k=rs.reduce((a,r)=>a+(r.skipped||0),0);
    const tt=p+f+k;
    const pct=tt?Math.round(100*p/tt):0;
    const okRuns=rs.filter(r=>(r.failed||0)===0).length;
    const rpct=total?Math.round(100*okRuns/total):0;
    const last=rs.length?rs[rs.length-1]:null;
    const lr=last?(last.overall||'?'):'—';
    const lc=lr==='PASS'?'var(--pass)':(lr==='FAIL'?'var(--fail)':'var(--muted)');
    const durs=rs.map(r=>r.total_duration_ms||0).filter(d=>d>0);
    const avgDur=durs.length?Math.round(durs.reduce((a,d)=>a+d,0)/durs.length):0;
    return `<div class="kpis">
      <div class="kpi"><div class="v">${total}</div><div class="l">Total Runs</div></div>
      <div class="kpi"><div class="v" style="color:var(--pass)">${rpct}%</div><div class="l">Runs Passed</div></div>
      <div class="kpi"><div class="v">${tt}</div><div class="l">Tests Executed</div></div>
      <div class="kpi"><div class="v" style="color:var(--accent)">${pct}%</div><div class="l">Test Pass Rate</div></div>
      <div class="kpi"><div class="v" style="color:${lc}">${esc(lr)}</div><div class="l">Last Run</div></div>
      <div class="kpi"><div class="v">${fmtDur(avgDur)}</div><div class="l">Avg Duration</div></div></div>`;
  }

  function benchBars(rs){
    // Aggregate per-step duration averages across runs.
    const totals={};
    for(const r of rs){
      const names=r.step_names||[],durs=r.step_durations_ms||[];
      for(let i=0;i<names.length;i++){
        const n=names[i],d=durs[i]||0;
        if(!n||d<=0)continue;
        const t=totals[n]=totals[n]||{sum:0,n:0};
        t.sum+=d;t.n+=1;
      }
    }
    const rows=Object.entries(totals)
      .map(([name,t])=>({name,avg:Math.round(t.sum/t.n),runs:t.n}))
      .sort((a,b)=>b.avg-a.avg);
    if(!rows.length)return '<p style="color:#475569;font-size:12px">No timing data yet. Run <code>pnpm validate:ci</code> (or <code>validate:full</code>) — new runs include per-step duration.</p>';
    const max=rows[0].avg||1;
    return rows.map(r=>{
      const pct=Math.max(2,100*r.avg/max).toFixed(1);
      return `<div class="scope-row"><span class="nm">${esc(r.name)}</span><div class="bar"><i style="width:${pct}%;background:#4ade80" title="${r.runs} run(s)"></i></div><span class="ct">${fmtDur(r.avg)}</span></div>`;
    }).join('');
  }

  function svgLine(rs){
    if(!rs.length)return '<p style="color:#475569;font-size:12px">No data yet.</p>';
    const w=480,h=200,pl=34,pb=24,pt=12,pr=12,cw=w-pl-pr,ch=h-pt-pb;
    const pts=rs.map((m,i)=>{
      const tt=m.total||1,rate=100*(m.passed||0)/tt;
      const x=pl+(cw*i/Math.max(1,rs.length-1)),y=pt+ch-(ch*rate/100);
      return {x,y,rate,m};
    });
    let grid='';
    for(const pct of [0,50,100]){const gy=pt+ch-(ch*pct/100);
      grid+=`<line x1="${pl}" y1="${gy.toFixed(1)}" x2="${w-pr}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-width="1"/>`+
            `<text x="${pl-6}" y="${(gy+3).toFixed(1)}" fill="#64748b" font-size="9" text-anchor="end">${pct}%</text>`;}
    const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const area=`M${pts[0].x.toFixed(1)},${pt+ch} L`+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')+` L${pts[pts.length-1].x.toFixed(1)},${pt+ch} Z`;
    const dots=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${(p.m.failed||0)===0?PASS:FAIL}"><title>${esc(p.m.ts||'?')} [${esc(scopeOf(p.m)||'?')}] ${Math.round(p.rate)}% (${p.m.passed||0}/${p.m.total||0})</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}<path d="${area}" fill="#7c3aed22"/><path d="${line}" fill="none" stroke="#a78bfa" stroke-width="2"/>${dots}</svg>`;
  }

  function svgDonut(p,f,k,size=180){
    const tt=p+f+k;
    if(!tt)return '<p style="color:#475569;font-size:12px">No data yet.</p>';
    const cx=size/2,cy=size/2,r=size/2-14;
    const segs=[[PASS,p],[FAIL,f],[SKIP,k]];
    let arcs='',angle=-90;
    for(const [c,v] of segs){
      if(!v)continue;
      const sweep=(v/tt)*360;
      // 360° as <circle> — A-arc with same start/end renders nothing.
      if(sweep>=359.999){arcs+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="22"/>`;angle+=sweep;continue;}
      const a1=angle*Math.PI/180,a2=(angle+sweep)*Math.PI/180;
      const x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
      const x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
      const lg=sweep>180?1:0;
      arcs+=`<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)} 0 ${lg} 1 ${x2.toFixed(2)},${y2.toFixed(2)}" fill="none" stroke="${c}" stroke-width="22"/>`;
      angle+=sweep;
    }
    const pct=Math.round(100*p/tt);
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${arcs}<text x="${cx}" y="${cy-2}" fill="#e2e8f0" font-size="26" font-weight="800" text-anchor="middle">${pct}%</text><text x="${cx}" y="${cy+16}" fill="#64748b" font-size="10" text-anchor="middle">PASS RATE</text></svg>`;
  }

  function scopeBars(rs){
    const labels=[['local','Local'],['ci','CI'],['release','Release']];
    return labels.map(([sd,label])=>{
      const sr=rs.filter(r=>scopeOf(r)===sd);
      const p=sr.reduce((a,r)=>a+(r.passed||0),0);
      const f=sr.reduce((a,r)=>a+(r.failed||0),0);
      const k=sr.reduce((a,r)=>a+(r.skipped||0),0);
      const tt=p+f+k;
      if(!tt)return `<div class="scope-row"><span class="nm">${label}</span><div class="bar"></div><span class="ct" style="color:#475569">—</span></div>`;
      const pp=(100*p/tt).toFixed(1),fp=(100*f/tt).toFixed(1),kp=(100*k/tt).toFixed(1);
      return `<div class="scope-row"><span class="nm">${label}</span><div class="bar"><i style="width:${pp}%;background:${PASS}"></i><i style="width:${fp}%;background:${FAIL}"></i><i style="width:${kp}%;background:${SKIP}"></i></div><span class="ct">${p}/${tt}</span></div>`;
    }).join('');
  }

  function suiteBars(rs){
    const SUITES=[['home','Home'],['qam_shelves','QAM Shelves'],['qam_smart','QAM Smart'],
                  ['qam_global_toggles','QAM Global'],['about','About'],['context_menu','Context Menu'],
                  ['perf','Performance'],['crash_protection','Crash Protection'],['stress','Stress']];
    const totals={};
    for(const r of rs){
      const ps=r.per_suite;if(!ps||typeof ps!=='object')continue;
      for(const [s,c] of Object.entries(ps)){
        const t=totals[s]=totals[s]||{passed:0,failed:0,skipped:0};
        t.passed+=c.passed||0;t.failed+=c.failed||0;t.skipped+=c.skipped||0;
      }
    }
    if(!Object.keys(totals).length)return '<p style="color:#475569;font-size:12px">No UI test data yet. Run <code>pnpm validate:full</code> with a Deck connected.</p>';
    return SUITES.map(([key,label])=>{
      const s=totals[key];if(!s)return '';
      const tt=s.passed+s.failed+s.skipped;if(!tt)return '';
      const pp=(100*s.passed/tt).toFixed(1),fp=(100*s.failed/tt).toFixed(1),kp=(100*s.skipped/tt).toFixed(1);
      const pct=Math.round(100*s.passed/tt);
      return `<div class="scope-row"><span class="nm">${esc(label)}</span><div class="bar"><i style="width:${pp}%;background:${PASS}"></i><i style="width:${fp}%;background:${FAIL}"></i><i style="width:${kp}%;background:${SKIP}"></i></div><span class="ct">${pct}% (${s.passed}/${tt})</span></div>`;
    }).filter(Boolean).join('');
  }

  function render(){
    const view=filterRuns(runs,currentScope,currentDeck,currentStress);
    const empty=view.length===0;
    // Pills always render against the full `runs` array so an empty
    // filtered view still leaves the pills visible + clickable for
    // un-toggling. See `pills()` for the count semantics.
    $('pills').innerHTML=pills(runs);
    const sel=[currentScope!=='all'?currentScope:null,
               currentDeck!=='all'?('deck='+currentDeck):null,
               currentStress!=='all'?('stress='+currentStress):null].filter(Boolean).join(' · ')||'all';
    $('kpis-host').innerHTML=empty
      ? `<div class="empty-scope">No <strong>${esc(sel)}</strong> runs yet. Run <code>pnpm validate:full</code> (local) or push to a tracked branch (CI) to see data here.</div>`
      : kpis(view);
    $('line').innerHTML=svgLine(view);
    $('suites').innerHTML=suiteBars(view);
    const p=view.reduce((a,r)=>a+(r.passed||0),0);
    const f=view.reduce((a,r)=>a+(r.failed||0),0);
    const k=view.reduce((a,r)=>a+(r.skipped||0),0);
    $('donut').innerHTML=svgDonut(p,f,k);
    $('donut-legend').innerHTML=`<span><i style="background:${PASS}"></i> ${p} pass</span><span><i style="background:${FAIL}"></i> ${f} fail</span><span><i style="background:${SKIP}"></i> ${k} skip</span>`;
    $('scopes').innerHTML=scopeBars(view);
    const benchHost=$('bench');
    if(benchHost)benchHost.innerHTML=benchBars(view);
    $('footer-count').textContent=view.length;
  }

  function syncHash(){
    const parts=[];
    if(currentScope!=='all')parts.push('scope='+currentScope);
    if(currentDeck!=='all')parts.push('deck='+currentDeck);
    if(currentStress!=='all')parts.push('stress='+currentStress);
    try{history.replaceState(null,'',parts.length?('#'+parts.join('&')):'#')}catch(_){}
  }
  function setScope(s){
    if(!['all','local','ci','release'].includes(s))return;
    currentScope=s;
    document.querySelectorAll('.filter-chips button')
      .forEach(b=>b.classList.toggle('active',b.dataset.filter===s));
    syncHash(); render();
  }
  // Click on a pill toggles its axis. Re-clicking an active pill resets
  // that axis to 'all' so the user can quickly clear the filter without
  // a separate reset control.
  function togglePill(axis,value){
    if(axis==='deck'){currentDeck=(currentDeck===value?'all':value);}
    else if(axis==='stress'){currentStress=(currentStress===value?'all':value);}
    syncHash(); render();
  }

  document.querySelectorAll('.filter-chips button')
    .forEach(b=>b.addEventListener('click',()=>setScope(b.dataset.filter)));
  // Delegated on #pills since the buttons are re-rendered by render().
  document.getElementById('pills').addEventListener('click',(e)=>{
    const btn=e.target.closest('button[data-pill-axis]');
    if(!btn)return;
    togglePill(btn.dataset.pillAxis,btn.dataset.pillValue);
  });

  // Parse `#scope=local&deck=yes&stress=no` (current format) or the legacy
  // single-token form `#local` (compat with bookmarks predating the
  // multi-axis filter).
  const hash=(location.hash||'').replace(/^#/,'');
  if(hash){
    if(hash.includes('=')){
      for(const kv of hash.split('&')){
        const [k,v]=kv.split('=');
        if(k==='scope')setScope(v);
        else if(k==='deck'&&['yes','no'].includes(v))currentDeck=v;
        else if(k==='stress'&&['yes','no'].includes(v))currentStress=v;
      }
      render();
    } else {
      setScope(hash);
    }
  } else {
    render();
  }

  // Augment with live manifests. file:// in Chromium blocks fetch — that's
  // OK, the baked data already in the page is the fallback. Firefox file://
  // and any http:// server picks up locally-generated runs that weren't
  // committed (typically `reports/local/`, which is gitignored).
  Promise.all(SCOPES.map(s=>fetch(s+'/runs-manifest.json',{cache:'no-cache'})
    .then(r=>r.ok?r.json():[]).catch(()=>[]))).then(lists=>{
    const fetched=[].concat(...lists).map(r=>Object.assign({},r,{_scope:r._scope||r.scope}));
    if(!fetched.length)return;
    const merged=sortRuns(dedupe(runs.concat(fetched)));
    if(merged.length===runs.length)return;
    runs=merged;render();
  });
})();
""".strip()


def _rebuild_dashboard(reports_root: Path) -> None:
    """Write the dashboard as a STATIC SHELL driven by client-side JS.

    The shell embeds the runs the generator saw (`window.__BAKED_RUNS__`) so
    the page is never blank, then augments at view time by fetching each
    scope's `runs-manifest.json` — pulling in locally-generated reports that
    were never committed (`reports/local/` is gitignored). file:// in
    Chromium blocks fetch and falls back to the baked data; Firefox or any
    http server (e.g. `pnpm reports`) sees everything on disk.
    """
    runs = _collect_all_runs(reports_root)
    # Strip Python-internal markers we won't need on the client; keep `_scope`
    # since the JS uses it to bucket runs.
    baked = [
        {k: v for k, v in m.items() if not k.startswith("__")}
        for m in runs
    ]

    chips = (
        '<div class="filter-chips" role="tablist" aria-label="Scope filter">'
        + "".join(
            f'<button type="button" data-filter="{s}" '
            f'class="{"active" if s == "all" else ""}" role="tab">{label}</button>'
            for s, label in (("all", "All"), ("local", "Local"), ("ci", "CI"), ("release", "Release"))
        )
        + '</div>'
    )

    # Static panel skeleton. The JS fills the `id`-tagged containers; the
    # text fallbacks here keep the page readable for ~50ms before JS runs
    # (or forever if JS is disabled — rare, but doesn't hurt).
    panels = """
  <div id="pills"></div>
  <div id="kpis-host"></div>

  <div class="panel">
    <h2>Pass rate over time &mdash; all runs</h2>
    <div id="line"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> run passed</span>
      <span><i style="background:#f87171"></i> run had failures</span>
    </div>
  </div>

  <div class="panel">
    <h2>Coverage by test suite &mdash; pass rate per suite (aggregated)</h2>
    <div id="suites"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> pass</span>
      <span><i style="background:#f87171"></i> fail</span>
      <span><i style="background:#94a3b8"></i> skip</span>
      <span style="color:#64748b;font-size:10px">(% = pass rate, requires a local run with Deck)</span>
    </div>
  </div>

  <div class="panel-grid">
    <div class="panel">
      <h2>Overall test distribution</h2>
      <div style="text-align:center" id="donut"></div>
      <div class="legend" style="justify-content:center" id="donut-legend"></div>
    </div>
    <div class="panel">
      <h2>Results by scope</h2>
      <div id="scopes"></div>
      <div class="legend">
        <span><i style="background:#4ade80"></i> pass</span>
        <span><i style="background:#f87171"></i> fail</span>
        <span><i style="background:#94a3b8"></i> skip</span>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>Step durations &mdash; average across runs (ms)</h2>
    <div id="bench"></div>
    <div class="legend">
      <span><i style="background:#4ade80"></i> avg duration</span>
      <span style="color:#64748b;font-size:10px">(per step, sourced from each run's `step_durations_ms`)</span>
    </div>
  </div>
"""

    baked_json = json.dumps(baked, separators=(",", ":"))
    dash = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Shelves &mdash; Dashboard</title>
<style>{_DASH_CSS}</style>
</head>
<body>
<header>
  <h1>Deck Shelves &mdash; Dashboard</h1>
  <a class="back" href="index.html">&larr; All reports</a>
</header>
<main>
  {chips}
  {panels}
</main>
<footer>Deck Shelves CI &middot; dashboard &middot; <span id="footer-count">0</span> run(s) aggregated</footer>
<script>window.__BAKED_RUNS__={baked_json};</script>
<script>{_DASH_JS}</script>
</body>
</html>
"""
    (reports_root / "dashboard.html").write_text(dash, encoding="utf-8")


# ── Report generation ──────────────────────────────────────────────────────────

def _fmt_duration_ms(ms: int) -> str:
    """Human-friendly duration: 32 ms / 4.2 s / 1m 12s / 2h 5m."""
    if ms < 1000:
        return f"{ms} ms"
    s = ms / 1000.0
    if s < 60:
        return f"{s:.1f}s"
    m = int(s // 60)
    rem = int(s - m * 60)
    if m < 60:
        return f"{m}m {rem}s"
    h = m // 60
    return f"{h}h {m - h * 60}m"


def _render_step_durations_chart(names: List[str], statuses: List[str], durations_ms: List[int]) -> str:
    """SVG bar chart of per-step duration. Bars colored by step status."""
    if not names or not durations_ms or not any(durations_ms):
        return ""
    max_ms = max(durations_ms) or 1
    rows = []
    for n, s, d in zip(names, statuses, durations_ms):
        pct = max(2.0, 100.0 * d / max_ms)
        color = "#4ade80" if s == "pass" else ("#f87171" if s == "fail" else "#94a3b8")
        label = _html.escape(n)
        rows.append(
            f'<div class="bm-row">'
            f'<span class="bm-name">{label}</span>'
            f'<div class="bm-bar-wrap"><div class="bm-bar" style="width:{pct:.1f}%;background:{color}"></div></div>'
            f'<span class="bm-dur">{_fmt_duration_ms(d)}</span>'
            f'</div>'
        )
    return '<div class="bm">' + "".join(rows) + '</div>'


def generate(
    ts: str,
    stress: bool,
    subdir: str,
    names: List[str],
    statuses: List[str],
    logs: List[str],
    out_path: str,
    root: str,
    durations_ms: Optional[List[int]] = None,
) -> None:
    passed  = statuses.count("pass")
    failed  = statuses.count("fail")
    skipped = statuses.count("skip")
    total   = len(statuses)
    overall = "pass" if failed == 0 else "fail"
    if durations_ms is None:
        durations_ms = [0] * len(names)
    while len(durations_ms) < len(names):
        durations_ms.append(0)
    total_duration_ms = sum(d for d in durations_ms if isinstance(d, int) and d > 0)

    try:
        dt_str = datetime.strptime(ts, "%Y-%m-%d_%H-%M-%S").strftime("%B %d, %Y at %H:%M:%S")
    except ValueError:
        dt_str = ts

    scope_label = _subfolder_label(subdir)
    stress_tag = '<span class="stress-tag">stress</span>' if stress else ""

    steps_html = "".join(
        _step_html(n, s, l, root, i, duration_ms=durations_ms[i] if i < len(durations_ms) else 0)
        for i, (n, s, l) in enumerate(zip(names, statuses, logs))
    )
    benchmark_html = _render_step_durations_chart(names, statuses, durations_ms)

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
    <div class="sc"><div class="n t">{_fmt_duration_ms(total_duration_ms)}</div><div class="l">Duration</div></div>
  </div>
  {('<div class="panel"><h2>Step durations</h2>' + benchmark_html + '</div>') if benchmark_html else ''}
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

    # Extract per-suite breakdown from the "UI tests" step log (if present)
    per_suite: dict = {}
    for step_name, log_path in zip(names, logs):
        if "ui test" in step_name.lower() and log_path and Path(log_path).exists():
            try:
                raw = Path(log_path).read_text(errors="replace")
                per_suite = _parse_uitests_by_suite(raw)
            except OSError:
                pass
            break

    meta = {
        "ts": ts, "stress": stress, "subdir": subdir,
        "overall": overall.upper(),
        "passed": passed, "failed": failed, "skipped": skipped, "total": total,
        "per_suite": per_suite,
        "step_names": names,
        "step_durations_ms": durations_ms,
        "total_duration_ms": total_duration_ms,
    }
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # NOTE: per-run generation only writes `{ts}.html` and `{ts}.json` for
    # this run. The derived aggregates (per-scope `index.html`, per-scope
    # `runs-manifest.json`, top-level `index.html`, `dashboard.html`) are
    # NOT touched here — they're regenerated explicitly via `--rebuild`
    # (exposed as `pnpm reports:rebuild`). That keeps the auto-commit step
    # in CI from churning the committed dashboards on every run, and lets
    # the contributor refresh them on demand against whatever's on disk
    # locally (including `reports/local/`, which is gitignored).


def rebuild_aggregates(reports_root: Path, scope_only: bool = False) -> None:
    """Regenerate derived artifacts across all scopes.

    Walks `local/`, `ci/`, `release/` (whichever exist) and rewrites each
    scope's `index.html` + `runs-manifest.json`. Unless `scope_only` is set,
    also rewrites the top-level `index.html` and the client-side
    `dashboard.html`. Idempotent — running it twice produces identical
    output for the same per-run files.

    `scope_only` is used by the validate runner: the top index + dashboard
    are static client-side shells that fetch each scope's manifest at view
    time, so they never need per-run regeneration — and skipping them keeps
    those two gitignored files from being rewritten on every local run.
    """
    for sd in ("local", "ci", "release"):
        sp = reports_root / sd
        if sp.exists():
            _rebuild_subfolder_index(sp)
    if scope_only:
        return
    _rebuild_top_index(reports_root)
    _rebuild_dashboard(reports_root)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--rebuild", action="store_true",
                   help="Regenerate the aggregates (manifests, indexes, dashboard) "
                        "across all scopes under --root. No per-run report is written.")
    p.add_argument("--scope-only", action="store_true", dest="scope_only",
                   help="With --rebuild: regenerate only per-scope indexes + "
                        "manifests; skip the top-level index.html + dashboard.html.")
    p.add_argument("--ts",         required=False)
    p.add_argument("--stress",     required=False)
    p.add_argument("--subdir",     required=False)
    p.add_argument("--tmp",        required=False)
    p.add_argument("--out",        required=False)
    p.add_argument("--root",       required=True)
    p.add_argument("--steps-json", required=False, dest="steps_json")
    args = p.parse_args()

    if args.rebuild:
        rebuild_aggregates(Path(args.root) / "reports" if (Path(args.root) / "reports").is_dir()
                           else Path(args.root),
                           scope_only=args.scope_only)
        return 0

    # Per-run path needs the full set of arguments.
    missing = [n for n in ("ts", "stress", "subdir", "tmp", "out", "steps_json") if not getattr(args, n)]
    if missing:
        print(f"report.py: missing required arg(s) for per-run mode: {missing}", file=sys.stderr)
        return 2

    try:
        data = json.loads(Path(args.steps_json).read_text())
    except Exception as e:
        print(f"report.py: could not read steps-json: {e}", file=sys.stderr)
        data = {}

    names    = data.get("names",    [])
    statuses = data.get("statuses", [])
    logs     = data.get("logs",     [])
    durations_ms = data.get("durations_ms", [])
    while len(logs) < len(names):
        logs.append("")
    while len(durations_ms) < len(names):
        durations_ms.append(0)

    generate(
        ts=args.ts, stress=args.stress == "1", subdir=args.subdir,
        names=names, statuses=statuses, logs=logs,
        durations_ms=durations_ms,
        out_path=args.out, root=args.root,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
