#!/usr/bin/env python3
"""
UI test suite runner. Local-only — runs against a real Steam Deck (or a
SteamOS VM) over CDP and exercises high-level user flows. Not part of CI.

Usage:
    python3 -m devkit.uitests.run \
        --host <deck-host> [--port 8080] [--out tmp/uitest-out] \
        [--only home,qam_shelves]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(THIS_DIR.parent.parent.parent.parent))
    __package__ = "devkit.uitests"

from .lib.runner import run, SUITES  # noqa: E402

REPO_ROOT = THIS_DIR.parent.parent.parent.parent


def _load_external_suites(suites_dir: str) -> None:
    import importlib.util
    p = Path(suites_dir).resolve()
    if not p.is_dir():
        return
    for f in sorted(p.glob("*.py")):
        if f.name.startswith("_"):
            continue
        spec = importlib.util.spec_from_file_location(f"_uitest_suite_{f.stem}", f)
        if not spec or not spec.loader:
            continue
        mod = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(mod)
        except Exception as e:
            print(f"[uitests] failed to load {f.name}: {e}", file=sys.stderr)


def _load_env() -> tuple[str, int]:
    host = os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8080") or "8080")
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "DECK_HOST" and not host:
                host = v
            elif k == "DECK_CDP_PORT" and v:
                try:
                    port = int(v)
                except ValueError:
                    pass
    return host, port


def main() -> int:
    parser = argparse.ArgumentParser(description="Generic UI test runner (local-only). Loads project suites from --suites-dir.")
    parser.add_argument("--host")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--out", default=str(REPO_ROOT / "tmp" / "uitest-out"))
    parser.add_argument("--only", default="", help="Comma-separated suite or `suite.test` names")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--suites-dir", default=os.environ.get("UITESTS_SUITES_DIR", ""),
                        help="Directory containing suite *.py files (each calling @suite(...).test()).")
    args = parser.parse_args()

    if args.suites_dir:
        _load_external_suites(args.suites_dir)

    if args.list:
        for s in SUITES.values():
            print(s.name)
            for name, _ in s.tests:
                print(f"  - {name}")
        return 0

    env_host, env_port = _load_env()
    host = args.host or env_host
    port = args.port or env_port
    if not host:
        print("error: --host required (or set DECK_HOST)", file=sys.stderr)
        return 2

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    only = [s.strip() for s in args.only.split(",") if s.strip()] if args.only else None
    print(f"Targeting {host}:{port}")

    results = run(host, port, out_dir, only=only)
    passed = sum(1 for r in results if r.status == "pass")
    failed = sum(1 for r in results if r.status == "fail")
    print()
    print(f"Summary: {passed} passed, {failed} failed (out of {len(results)})")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
