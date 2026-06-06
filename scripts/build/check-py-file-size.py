#!/usr/bin/env python3
# Python parity for ESLint's `max-lines` rule (cap 1000 code lines).
# Counts non-blank, non-comment lines per .py and errors on overruns.
# Scope mirrors `pnpm run lint:py`: main.py + scripts/ (recurses).
from __future__ import annotations

import sys
from pathlib import Path

MAX_LINES = 1000
EXCLUDE_DIRS = {"__pycache__", ".deploy", "build", "dist", "node_modules", ".venv"}


def code_lines(path: Path) -> int:
    n = 0
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for raw in f:
            s = raw.strip()
            if not s or s.startswith("#"):
                continue
            n += 1
    return n


def iter_targets(roots: list[Path]):
    for root in roots:
        if not root.exists():
            continue
        if root.is_file() and root.suffix == ".py":
            yield root
            continue
        for p in root.rglob("*.py"):
            if any(part in EXCLUDE_DIRS for part in p.parts):
                continue
            yield p


def main(argv: list[str]) -> int:
    repo = Path(__file__).resolve().parent.parent.parent
    roots = [repo / a for a in (argv or ["main.py", "scripts"])]
    fails: list[tuple[Path, int]] = []
    for path in iter_targets(roots):
        n = code_lines(path)
        if n > MAX_LINES:
            fails.append((path.relative_to(repo), n))
    if not fails:
        return 0
    fails.sort(key=lambda t: t[1], reverse=True)
    print("Python files over max-lines cap (1000 code lines):", file=sys.stderr)
    for rel, n in fails:
        print(f"  {rel}: {n} code lines (over by {n - MAX_LINES})", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
