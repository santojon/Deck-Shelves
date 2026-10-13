"""Session helpers the older project probes share: connect to a Steam target,
evaluate an expression (promises awaited), print a section separator.

Usage (from a probe in scripts/deckprobe-ext/probes/):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
    from probe_base import connect, ev, sep
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.lib import cdp  # noqa: E402


def connect(target: str = "SharedJSContext"):
    """Open a session on `target` (title substring); returns (session, host, port)."""
    host, port = cdp.load_env(str(ROOT / ".env"))
    return cdp.open_session(host, port, target), host, port


def ev(session, expression: str, timeout: float = 8.0):
    """Evaluate in the session and return the value (async expressions are awaited)."""
    return session.evaluate(expression, timeout=timeout)


def sep(title: str = "") -> None:
    label = f"── {title} " if title else ""
    print("\n" + label + "─" * max(4, 64 - len(label)))
