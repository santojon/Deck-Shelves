#!/usr/bin/env python3
"""
Modular screenshot runner. Iterates registered scenarios in
`scripts/devtools/deck/screenshots/scenarios/` and writes captures to
`assets/screenshots/`. Drop-in replacement for the monolithic
`screenshot.py` — same output filenames for the existing required set,
plus extra captures.

Usage:
    python3 -m scripts.devtools.deck.screenshots.run \
        --host <deck-host> [--port 8080] [--out assets/screenshots] \
        [--only home,qam,about_overview]

Surface dispatch:
    Each scenario decides whether to capture from `bigpicture` or `qam`
    via the helpers in `lib/capture.py`. The runner is surface-agnostic.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Allow running as a script (without -m).
THIS_DIR = Path(__file__).resolve().parent
if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(THIS_DIR.parent.parent.parent.parent))
    __package__ = "scripts.devtools.deck.screenshots"

from .lib.cdp import open_session, list_targets  # noqa: E402
from .scenarios._registry import ALL_SCENARIOS  # noqa: E402
# Side-effect imports populate ALL_SCENARIOS via @register decorators.
from .scenarios import home as _home_s  # noqa: E402,F401
from .scenarios import qam as _qam_s  # noqa: E402,F401
from .scenarios import about as _about_s  # noqa: E402,F401
from .scenarios import modals as _modals_s  # noqa: E402,F401


REPO_ROOT = THIS_DIR.parent.parent.parent.parent
DEFAULT_OUT = REPO_ROOT / "assets" / "screenshots"


def _load_env_host() -> tuple[str, int]:
    """Load DECK_HOST / DECK_CDP_PORT from .env if present."""
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
    parser = argparse.ArgumentParser(description="Run modular Deck Shelves screenshots.")
    parser.add_argument("--host", help="Deck host (defaults to DECK_HOST in .env or env)")
    parser.add_argument("--port", type=int, default=0, help="CDP port (default 8080)")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory")
    parser.add_argument("--only", default="", help="Comma-separated scenario names to run (default: all)")
    parser.add_argument("--list", action="store_true", help="List registered scenarios and exit")
    args = parser.parse_args()

    if args.list:
        for name, _ in ALL_SCENARIOS:
            print(name)
        return 0

    env_host, env_port = _load_env_host()
    host = args.host or env_host
    port = args.port or env_port
    if not host:
        print("error: --host required (or set DECK_HOST)", file=sys.stderr)
        return 2

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None

    print(f"Targeting {host}:{port} → {out_dir}")
    print(f"Available targets: {[t.get('title', '?') for t in list_targets(host, port)]}")

    sjc = open_session(host, port, "SharedJSContext")

    captured: list[Path] = []
    failed: list[tuple[str, str]] = []
    try:
        for name, fn in ALL_SCENARIOS:
            if only is not None and name not in only:
                continue
            print(f"[{name}] running…")
            t0 = time.time()
            try:
                results = fn(sjc, host, port, out_dir)
                for fname, p in (results or {}).items():
                    if p and p.exists():
                        size_kb = p.stat().st_size // 1024
                        captured.append(p)
                        print(f"  → {fname} ({size_kb} KB) in {time.time()-t0:.1f}s")
                    else:
                        failed.append((name, f"no output for {fname}"))
            except Exception as e:
                failed.append((name, str(e)))
                print(f"  ✗ {name}: {e}")
    finally:
        sjc.close()

    print()
    print(f"Captured {len(captured)} screenshots")
    if failed:
        print(f"Failed: {len(failed)}")
        for name, msg in failed:
            print(f"  - {name}: {msg}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
