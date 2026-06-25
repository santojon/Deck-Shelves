"""Settings page tabs — opened via the QAM gear icon (not a route nav, which
lands on the library).

The Shelves and Statistics tabs are visible by default. Integrations and
Advanced tabs only render with Advanced mode on, so those two are best-effort:
if the tab is absent the scenario returns no file.
"""
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

GEAR_ICON = "M19.4 15a1.65"  # Settings gear icon in the QAM title bar


def _open_settings(sjc: Session, host: str, port: int) -> bool:
    if not navigate_to_ds_qam(sjc, host, port):
        return False
    if not click_qam_button(host, port, GEAR_ICON):
        return False
    time.sleep(2.5)
    return True


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
    if not _open_settings(sjc, host, port):
        return {}
    out = out_dir / "settings-page.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"settings-page.png": p} if p else {}


@register("settings_profiles")
def settings_profiles(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_settings(sjc, host, port):
        return {}
    # "Perfis" (PT) / "Profiles" (EN) — match the common prefix "perf"/"prof".
    if _switch_tab(host, port, "perf") != "ok" and _switch_tab(host, port, "prof") != "ok":
        return {}
    time.sleep(0.7)
    out = out_dir / "settings-profiles.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"settings-profiles.png": p} if p else {}


@register("settings_statistics")
def settings_statistics(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_settings(sjc, host, port):
        return {}
    if _switch_tab(host, port, "statistic") != "ok":
        return {}
    time.sleep(0.8)
    out = out_dir / "settings-statistics.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"settings-statistics.png": p} if p else {}


@register("settings_integrations")
def settings_integrations(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_settings(sjc, host, port):
        return {}
    if _switch_tab(host, port, "integration") != "ok":
        return {}
    time.sleep(0.7)
    out = out_dir / "settings-integrations.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"settings-integrations.png": p} if p else {}


@register("settings_advanced")
def settings_advanced(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    if not _open_settings(sjc, host, port):
        return {}
    if _switch_tab(host, port, "advanced") != "ok":
        return {}
    time.sleep(0.7)
    out = out_dir / "settings-advanced.png"
    p = capture_bigpicture(host, port, out)
    _dismiss_bp_modal(host, port)
    return {"settings-advanced.png": p} if p else {}
