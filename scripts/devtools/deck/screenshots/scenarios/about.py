"""About page tabs."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import navigate_about, click_selector, await_selector
from ..lib.capture import capture_bigpicture
from ._registry import register


def _switch_tab(sjc: Session, label_substring: str) -> None:
    sjc.evaluate(f"""
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
""")
    time.sleep(0.7)


@register("about_overview")
def about_overview(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    out = out_dir / "about-page.png"
    p = capture_bigpicture(host, port, out)
    return {"about-page.png": p} if p else {}


@register("about_filters")
def about_filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    _switch_tab(sjc, "filter")
    out = out_dir / "about-filters.png"
    p = capture_bigpicture(host, port, out)
    return {"about-filters.png": p} if p else {}


@register("about_smart")
def about_smart(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    _switch_tab(sjc, "smart")
    out = out_dir / "about-smart.png"
    p = capture_bigpicture(host, port, out)
    return {"about-smart.png": p} if p else {}


@register("about_support")
def about_support(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    _switch_tab(sjc, "support")
    out = out_dir / "about-support.png"
    p = capture_bigpicture(host, port, out)
    return {"about-support.png": p} if p else {}
