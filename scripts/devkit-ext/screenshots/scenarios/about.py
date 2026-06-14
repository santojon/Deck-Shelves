"""About page tabs."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from devkit.screenshots.lib.cdp import Session
from devkit.screenshots.lib.nav import navigate_about, _bp_eval
from devkit.screenshots.lib.capture import capture_bigpicture
from devkit.screenshots.lib.registry import register


def _switch_tab(host: str, port: int, label_substring: str) -> None:
    _bp_eval(host, port, f"""
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
    _switch_tab(host, port, "filter")
    out = out_dir / "about-filters.png"
    p = capture_bigpicture(host, port, out)
    return {"about-filters.png": p} if p else {}


@register("about_smart")
def about_smart(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    _switch_tab(host, port, "smart")
    out = out_dir / "about-smart.png"
    p = capture_bigpicture(host, port, out)
    return {"about-smart.png": p} if p else {}


@register("about_support")
def about_support(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_about(sjc, settle_ms=2500)
    _switch_tab(host, port, "support")
    out = out_dir / "about-support.png"
    p = capture_bigpicture(host, port, out)
    return {"about-support.png": p} if p else {}
