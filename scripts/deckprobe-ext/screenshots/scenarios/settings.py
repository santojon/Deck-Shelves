"""Settings page tabs (route /deck-shelves/settings).

The Shelves and Statistics tabs are visible by default. Integrations and
Advanced tabs only render when Advanced mode is enabled (or, for
Integrations, when a third-party integration is registered), so those two
captures are best-effort: if the tab is absent the scenario returns no file
(same graceful degradation as the About scenarios). Run with Advanced mode
ON to capture all four.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import navigate, _bp_eval
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register

SETTINGS_ROUTE = "/deck-shelves/settings"


def _switch_tab(host: str, port: int, label_substring: str) -> str:
    return _bp_eval(host, port, f"""
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


@register("settings_overview")
def settings_overview(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate(sjc, SETTINGS_ROUTE, settle_ms=2500)
    out = out_dir / "settings-page.png"
    p = capture_bigpicture(host, port, out)
    return {"settings-page.png": p} if p else {}


@register("settings_statistics")
def settings_statistics(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate(sjc, SETTINGS_ROUTE, settle_ms=2500)
    if _switch_tab(host, port, "statistic") != "ok":
        return {}
    time.sleep(0.8)
    out = out_dir / "settings-statistics.png"
    p = capture_bigpicture(host, port, out)
    return {"settings-statistics.png": p} if p else {}


@register("settings_integrations")
def settings_integrations(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate(sjc, SETTINGS_ROUTE, settle_ms=2500)
    if _switch_tab(host, port, "integration") != "ok":
        return {}
    time.sleep(0.7)
    out = out_dir / "settings-integrations.png"
    p = capture_bigpicture(host, port, out)
    return {"settings-integrations.png": p} if p else {}


@register("settings_advanced")
def settings_advanced(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate(sjc, SETTINGS_ROUTE, settle_ms=2500)
    if _switch_tab(host, port, "advanced") != "ok":
        return {}
    time.sleep(0.7)
    out = out_dir / "settings-advanced.png"
    p = capture_bigpicture(host, port, out)
    return {"settings-advanced.png": p} if p else {}
