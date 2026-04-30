"""
Screenshot capture helpers. Each `capture_*` function takes a Session
opened against the right surface and writes the PNG to disk.

Surfaces:
  - `bigpicture` — the main Big Picture window (home, library, modals
    rendered inside the BP root).
  - `qam` — the popup QAM window. May fall back to bigpicture when the
    QAM popup is too small or off-screen (compositor returns a black
    frame of <60KB in that case).
"""
from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional

from .cdp import Session, list_targets, find_target, _normalize_host


# Surfaces that the QAM popup typically renders inside.
QAM_TITLE_SUBSTRING = "QuickAccess"
BIGPICTURE_TITLE_SUBSTRING = "Big Picture"
SHARED_JS_TITLE_SUBSTRING = "SharedJSContext"


def _capture(session: Session, out_path: Path) -> Path:
    """Run Page.captureScreenshot on the given session and write the PNG."""
    session.call("Page.enable")
    msg = session.call("Page.captureScreenshot", {"format": "png"})
    data = msg.get("result", {}).get("data", "")
    raw = base64.b64decode(data) if data else b""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(raw)
    return out_path


def capture_bigpicture(host: str, port: int, out_path: Path) -> Optional[Path]:
    targets = list_targets(host, port)
    target = find_target(targets, BIGPICTURE_TITLE_SUBSTRING)
    if not target:
        return None
    sess = Session.open(host, port, target)
    try:
        return _capture(sess, out_path)
    finally:
        sess.close()


def capture_qam(host: str, port: int, out_path: Path, fallback_to_bp: bool = True, min_bytes: int = 60_000) -> Optional[Path]:
    """Capture the QAM popup. When the resulting PNG is below `min_bytes`
    (a sign the compositor returned a black frame), optionally fall back
    to the Big Picture target so the QAM is captured as part of the
    surrounding window."""
    targets = list_targets(host, port)
    target = find_target(targets, QAM_TITLE_SUBSTRING)
    if not target:
        if fallback_to_bp:
            return capture_bigpicture(host, port, out_path)
        return None
    sess = Session.open(host, port, target)
    try:
        result = _capture(sess, out_path)
        if fallback_to_bp and result and result.stat().st_size < min_bytes:
            sess.close()
            return capture_bigpicture(host, port, out_path)
        return result
    finally:
        try:
            sess.close()
        except Exception:
            pass


def capture(host: str, port: int, surface: str, out_path: Path) -> Optional[Path]:
    """Generic dispatcher. `surface` is one of `"bigpicture"` or `"qam"`."""
    surface = surface.lower()
    if surface in ("bigpicture", "bp", "bigpicture_window"):
        return capture_bigpicture(host, port, out_path)
    if surface in ("qam", "quickaccess"):
        return capture_qam(host, port, out_path)
    raise ValueError(f"Unknown surface {surface!r}; expected 'bigpicture' or 'qam'")
