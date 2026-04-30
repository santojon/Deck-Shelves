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


# Legacy clip expression — locates the QAM panel and walks up at most 4
# parents while each parent is <=15% wider, then returns its bounding
# rect. Mirrors the approach used in the legacy monolithic
# `screenshot.py` so captures match the validator's portrait
# aspect-ratio expectation for QAM popups.
_QAM_PANEL_CLIP_EXPR = """
(function(){
  const sel = [
    '[id^="quickaccess_content_"]',
    '[class*="quickaccessmenu_PanelOuterNav"]',
    '[class*="QuickAccess"][class*="Panel"]',
    '#QuickAccess-Menu',
    '#QuickAccess-NA',
  ];
  let el = null;
  for (const s of sel) { const m = document.querySelector(s); if (m) { el = m; break; } }
  if (!el) {
    const candidates = Array.from(document.querySelectorAll('[class]'));
    for (const c of candidates) {
      const cls = String(c.className || '');
      if (cls.includes('QuickAccess') || cls.includes('quickaccess')) { el = c; break; }
    }
  }
  if (!el) return null;
  let best = el;
  let bestRect = el.getBoundingClientRect();
  for (let p = el.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
    const pr = p.getBoundingClientRect();
    if (pr.width <= 0 || pr.height <= 0) continue;
    if (pr.width > bestRect.width * 1.15) break;
    best = p; bestRect = pr;
  }
  return {
    x: Math.max(0, Math.floor(bestRect.left)),
    y: Math.max(0, Math.floor(bestRect.top)),
    width: Math.max(1, Math.ceil(bestRect.width)),
    height: Math.max(1, Math.ceil(bestRect.height)),
    scale: 1,
  };
})()
"""


def _capture(session: Session, out_path: Path, clip: Optional[dict] = None) -> Path:
    """Run Page.captureScreenshot on the given session and write the PNG.

    `clip` (optional) forwards a CDP `Page.captureScreenshot` clip rect
    `{ x, y, width, height, scale }` so callers can crop to a specific
    element instead of capturing the whole target viewport.
    """
    session.call("Page.enable")
    params: dict = {"format": "png"}
    if clip:
        params["clip"] = clip
        params["captureBeyondViewport"] = False
        params["fromSurface"] = False
    msg = session.call("Page.captureScreenshot", params)
    data = msg.get("result", {}).get("data", "")
    raw = base64.b64decode(data) if data else b""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(raw)
    return out_path


def _qam_panel_clip(session: Session) -> Optional[dict]:
    """Measure the QAM panel via the legacy clip expression and return a
    `Page.captureScreenshot` clip dict, or `None` when no panel is
    present / the rect is too small to be meaningful."""
    try:
        rect = session.evaluate(_QAM_PANEL_CLIP_EXPR)
    except Exception:
        return None
    if not isinstance(rect, dict):
        return None
    if rect.get("width", 0) < 50 or rect.get("height", 0) < 50:
        return None
    return rect


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
    """Capture the QAM popup, clipped to the panel rect (legacy
    parent-walker approach) so the resulting PNG is portrait-shaped.
    Falls back to the Big Picture target when the QAM popup is missing
    or the compositor returns a blank frame."""
    targets = list_targets(host, port)
    target = find_target(targets, QAM_TITLE_SUBSTRING)
    if not target:
        if fallback_to_bp:
            return capture_bigpicture(host, port, out_path)
        return None
    sess = Session.open(host, port, target)
    try:
        clip = _qam_panel_clip(sess)
        result = _capture(sess, out_path, clip=clip)
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
