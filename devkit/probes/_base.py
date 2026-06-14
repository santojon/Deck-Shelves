"""Shared helper: resolve host/port from .env and open a CDP Session."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow running as a script or via -m
THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent.parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from devkit.screenshots.lib.cdp import Session, open_session  # noqa: E402


def load_env() -> tuple[str, int]:
    host = os.environ.get("DECK_CDP_HOST") or os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8081") or "8081")
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ("DECK_CDP_HOST", "DECK_HOST") and not host:
                host = v
            elif k == "DECK_CDP_PORT" and v:
                try:
                    port = int(v)
                except ValueError:
                    pass
    return host, port


def connect(title: str = "SharedJSContext") -> tuple[Session, str, int]:
    host, port = load_env()
    if not host:
        raise SystemExit("DECK_HOST not set — add it to .env or export the variable")
    sjc = open_session(host, port, title)
    return sjc, host, port


def ev(sjc: Session, expr: str, timeout: float = 12.0):
    return sjc.evaluate(expr, timeout=timeout)


def sep(title: str = "") -> None:
    line = "─" * 55
    if title:
        pad = max(0, 55 - len(title) - 3)
        print(f"\n── {title} {'─' * pad}")
    else:
        print(f"\n{line}")
