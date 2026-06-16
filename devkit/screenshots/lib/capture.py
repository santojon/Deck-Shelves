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
import os
import sys
import time

_DEVKIT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if _DEVKIT_DIR not in sys.path:
    sys.path.insert(0, _DEVKIT_DIR)
from lib import selectors as _SEL  # noqa: E402
_QAM_SCOPE = _SEL.QAM_SCOPE_SEL


def _sub_sel(expr: str) -> str:
    return expr.replace("__QAM_SCOPE__", _QAM_SCOPE)
from pathlib import Path
from typing import Optional

from .cdp import Session, list_targets, find_target

QAM_CAPTURE_BLANK_THRESHOLD = 20_000  # bytes — retry if compositor returns black frame


# Surfaces that the QAM popup typically renders inside.
QAM_TITLE_SUBSTRING = "QuickAccess"
BIGPICTURE_TITLE_SUBSTRING = "Big Picture"
SHARED_JS_TITLE_SUBSTRING = "SharedJSContext"


# QAM panel clip expression. Anchors on Steam's own QuickAccess panel
# selectors first (most reliable bounding rect), falling back to our
# own scope element. Parent walker stops when a significantly wider
# ancestor is reached. No landscape rejection — the caller decides
# what to do with the rect (blank-frame retry handles bad captures).
_QAM_PANEL_CLIP_EXPR = """
(function(){
  var el = null;
  // Primary: Steam QuickAccess panel selectors (match legacy script).
  var sel = [
    '[id^="quickaccess_content_"]',
    '[class*="quickaccessmenu_PanelOuterNav"]',
    '[class*="QuickAccess"][class*="Panel"]',
    '#QuickAccess-Menu',
    '#QuickAccess-NA',
  ];
  for (var s of sel) { var m = document.querySelector(s); if (m) { el = m; break; } }
  // Fallback: our own scope element.
  if (!el) el = document.querySelector('__QAM_SCOPE__');
  if (!el) {
    var cands = Array.from(document.querySelectorAll('[class]'));
    for (var c of cands) {
      var cls = String(c.className || '');
      if (cls.includes('QuickAccess') || cls.includes('quickaccess')) { el = c; break; }
    }
  }
  if (!el) return null;
  var best = el;
  var bestRect = el.getBoundingClientRect();
  for (var p = el.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
    var pr = p.getBoundingClientRect();
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


def _capture(session: Session, out_path: Path, clip: Optional[dict] = None, from_surface: bool = True) -> Path:
    """Run Page.captureScreenshot on the given session and write the PNG.

    `from_surface=True` (default) uses the window's own rendering surface —
    correct for Big Picture captures (no compositor bleed from other windows).
    `from_surface=False` uses the system compositor surface — required for QAM
    popup captures to get correct portrait proportions.
    """
    session.call("Page.enable")
    params: dict = {"format": "png"}
    if not from_surface:
        params["fromSurface"] = False
    if clip:
        params["clip"] = clip
        params["captureBeyondViewport"] = False
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
        rect = session.evaluate(_sub_sel(_QAM_PANEL_CLIP_EXPR))
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
        return _capture(sess, out_path, from_surface=True)
    finally:
        sess.close()


def capture_qam(host: str, port: int, out_path: Path, fallback_to_bp: bool = True) -> Optional[Path]:
    """Capture the QAM popup, clipped to the panel rect (legacy
    parent-walker approach) so the resulting PNG is portrait-shaped.

    Retries up to 5 times when the compositor returns a blank/black frame
    (size < QAM_CAPTURE_BLANK_THRESHOLD). Only falls back to Big Picture
    when the QAM popup target is entirely absent.
    """
    targets = list_targets(host, port)
    target = find_target(targets, QAM_TITLE_SUBSTRING)
    if not target:
        if fallback_to_bp:
            return capture_bigpicture(host, port, out_path)
        return None
    for attempt in range(5):
        sess = Session.open(host, port, target)
        try:
            clip = _qam_panel_clip(sess)
            # Use the popup's own rendering surface (fromSurface=True/default).
            # fromSurface=False (compositor) was returning a 1280px-wide frame
            # with the panel clipped incorrectly — causing a black band on the right.
            p = _capture(sess, out_path, clip=clip, from_surface=True)
        finally:
            try:
                sess.close()
            except Exception:
                pass
        if p and p.exists() and p.stat().st_size > QAM_CAPTURE_BLANK_THRESHOLD:
            return p
        if attempt < 4:
            # Nudge compositor to repaint (same strategy as legacy script)
            try:
                from .cdp import Session as _S
                ns = _S.open(host, port, target)
                try:
                    ns.evaluate(_sub_sel("""(function(){
  var s = document.querySelector('__QAM_SCOPE__') || document.body;
  if (s) { s.scrollTop += 1; s.scrollTop -= 1; }
  var f = document.activeElement;
  if (f && f.blur) f.blur();
  if (f && f.focus) f.focus();
})()"""))
                finally:
                    ns.close()
            except Exception:
                pass
            time.sleep(0.8)
    return out_path if out_path.exists() else None


def capture(host: str, port: int, surface: str, out_path: Path) -> Optional[Path]:
    """Generic dispatcher. `surface` is one of `"bigpicture"` or `"qam"`."""
    surface = surface.lower()
    if surface in ("bigpicture", "bp", "bigpicture_window"):
        return capture_bigpicture(host, port, out_path)
    if surface in ("qam", "quickaccess"):
        return capture_qam(host, port, out_path)
    raise ValueError(f"Unknown surface {surface!r}; expected 'bigpicture' or 'qam'")
