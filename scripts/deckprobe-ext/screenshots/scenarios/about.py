"""About / docs page — opened via the QAM book icon (not a route nav, which
lands on the library). Tab variants switch the in-page [role=tab] bar."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import (
    navigate_to_ds_qam, click_qam_button, _bp_eval, _dismiss_bp_modal,
)
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register

BOOK_ICON = "M4 19.5A2.5"  # About / docs book icon in the QAM title bar


def _open_about(sjc: Session, host: str, port: int) -> bool:
    if not navigate_to_ds_qam(sjc, host, port):
        return False
    if not click_qam_button(host, port, BOOK_ICON):
        return False
    time.sleep(2.5)
    return True


def _switch_tab(host: str, port: int, label_substring: str) -> str:
    res = _bp_eval(host, port, f"""
(function(){{
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const t of tabs) {{
    if ((t.textContent || '').toLowerCase().includes({label_substring.lower()!r})) {{
      t.click();
      return 'ok';
    }}
  }}
  return 'not found';
}})()
""") or "no-result"
    time.sleep(0.8)
    return res


@register("about_overview")
def about_overview(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    out = out_dir / "about-page.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-page.png": p} if p else {}


# Locale-tolerant tab needles (Deck renders in its own language):
#   filters  → "filtr"   (Filtros / Filters / Filtres / Filtri)
#   smart    → "intelig" (Prateleiras Inteligentes / Smart …)  + "smart" fallback
#   support  → "sobre"   (Sobre / About)                       + "support"/"about"
@register("about_filters")
def about_filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    _switch_tab(host, port, "filtr")
    out = out_dir / "about-filters.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-filters.png": p} if p else {}


@register("about_smart")
def about_smart(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    if _switch_tab(host, port, "intelig") != "ok":
        _switch_tab(host, port, "smart")
    out = out_dir / "about-smart.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-smart.png": p} if p else {}


@register("about_support")
def about_support(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    if _switch_tab(host, port, "sobre") != "ok":
        if _switch_tab(host, port, "support") != "ok":
            _switch_tab(host, port, "about")
    out = out_dir / "about-support.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-support.png": p} if p else {}
