"""About / docs page — reached by a direct route nav (`/deck-shelves/about`,
registered via `routerHook.addRoute` in `index.tsx`), not the QAM book icon.
Tab variants switch the in-page [role=tab] bar.

Previously went through the QAM (open panel → click Decky tab → click
Deck Shelves plugin entry → click the book icon) because a direct route nav
"landed on the library" — that was `nav.py`'s own `navigate()` calling an
unconditional, unrelated `m_Navigator.LibraryTab()` before ever trying the
route, not a real platform limitation (fixed there; confirmed live that
`inst.Navigate('/deck-shelves/about')` lands correctly). The QAM path was
also the least reliable in this whole suite — Steam's own QAM tab-selection
state isn't reliably controllable from CDP, so any scenario that can reach
its target without going through it should."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import navigate_about, _bp_eval, _dismiss_bp_modal
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register
from ._locale import force_english

_LANDED_CHECK = "document.querySelectorAll('[role=\"tab\"]').length > 0"


def _open_about(sjc: Session, host: str, port: int) -> bool:
    force_english(sjc)
    _dismiss_bp_modal(host, port)
    navigate_about(sjc, settle_ms=2000)
    # One retry: a route nav right after a modal-dismiss can occasionally
    # land before the About page's own tab bar has mounted.
    if _bp_eval(host, port, _LANDED_CHECK) is True:
        return True
    navigate_about(sjc, settle_ms=1500)
    return _bp_eval(host, port, _LANDED_CHECK) is True


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


# English tab needles — screenshots are captured with the UI forced to en-US
# (see _open_about), so the tab labels are always English.
@register("about_filters")
def about_filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    _switch_tab(host, port, "filter")
    out = out_dir / "about-filters.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-filters.png": p} if p else {}


@register("about_smart")
def about_smart(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    _switch_tab(host, port, "smart")
    out = out_dir / "about-smart.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-smart.png": p} if p else {}


@register("about_support")
def about_support(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_about(sjc, host, port):
        return {}
    if _switch_tab(host, port, "support") != "ok":
        _switch_tab(host, port, "about")
    out = out_dir / "about-support.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"about-support.png": p} if p else {}
