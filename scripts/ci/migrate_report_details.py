#!/usr/bin/env python3
"""One-off migration: rewrite already-committed report HTML so the
collapsible steps use native <details>/<summary> instead of the old
onclick `toggle()` div pair. The old markup double-fires on touch
(touchstart + click), opening then immediately closing the step. New
reports already emit <details> via report.py; this brings historical
reports in line. Idempotent — files already migrated are left untouched.

Usage: python3 scripts/ci/migrate_report_details.py reports/**/*.html
"""
from __future__ import annotations

import re
import sys

_STEP_MARKER = '<div class="step" id="s'


def _migrate_css(html: str) -> str:
    html = html.replace(
        '.step-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;',
        '.step-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;list-style:none;')
    html = html.replace(
        '.step-hdr:hover{background:#273548}',
        '.step-hdr::-webkit-details-marker{display:none}\n.step-hdr:hover{background:#273548}')
    html = html.replace(
        '.chevron{font-size:11px;color:var(--muted)}',
        '.chevron{font-size:11px;color:var(--muted);display:inline-block;transition:transform .15s}\n'
        '.step[open] .chevron{transform:rotate(90deg)}')
    html = html.replace(
        '.step-body{display:none;border-top:1px solid var(--border);border-radius:0 0 9px 9px}',
        '.step-body{border-top:1px solid var(--border);border-radius:0 0 9px 9px}')
    return html.replace('.step-body.open{display:block}', '')


def _migrate_block(block: str) -> str:
    is_open = 'class="step-body open"' in block
    block = re.sub(r'<div class="step" id="(s\d+)">',
                   (r'<details class="step" id="\1" open>' if is_open
                    else r'<details class="step" id="\1">'),
                   block, count=1)
    block = re.sub(r'<div class="step-hdr" onclick="toggle\(\d+\)">',
                   '<summary class="step-hdr">', block, count=1)
    block = block.replace('</div><div class="step-body', '</summary><div class="step-body', 1)
    block = re.sub(r'(<span class="chevron"[^>]*>)[▼▶]', r'\1▶', block)
    # The step's own closing </div> is the last one in the block.
    head = block.rstrip()
    tail = block[len(head):]
    cut = head.rfind('</div>')
    if cut != -1:
        head = head[:cut] + '</details>' + head[cut + len('</div>'):]
    return head + tail


def migrate(html: str) -> tuple[str, bool]:
    if '<details class="step"' in html or _STEP_MARKER not in html:
        return html, False
    start = html.index(_STEP_MARKER)
    end = html.index('</main>', start)
    head, region, tail = html[:start], html[start:end], html[end:]

    parts = region.split(_STEP_MARKER)
    rebuilt = parts[0]
    for p in parts[1:]:
        rebuilt += _migrate_block(_STEP_MARKER + p)

    out = _migrate_css(head + rebuilt + tail)
    out = re.sub(r'<script>\s*function toggle\(i\)\{.*?\}\s*</script>\s*', '', out, flags=re.S)
    return out, True


def main(paths: list[str]) -> int:
    changed = 0
    for path in paths:
        try:
            with open(path, encoding="utf-8") as f:
                html = f.read()
        except OSError:
            continue
        new, did = migrate(html)
        if did:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            print(f"migrated {path}")
            changed += 1
    print(f"total migrated: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
