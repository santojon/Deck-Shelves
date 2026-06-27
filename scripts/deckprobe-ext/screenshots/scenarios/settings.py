"""Settings page tabs — opened via the QAM gear icon (not a route nav, which
lands on the library).

Shelves, Profiles, Backup, Shortcuts, Suggestions and Statistics are visible by
default (Shortcuts/Suggestions/Statistics hide in Light mode). Integrations and
Advanced only render with Advanced mode on, so those are best-effort: if the tab
is absent the scenario returns no file.

Tab matching tries both the English and Portuguese labels so the flow works
regardless of the device locale.
"""
from __future__ import annotations

import json
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


def _switch_tab(host: str, port: int, *substrings: str) -> str:
    """Click the first tab whose label contains any of `substrings` (lower-cased
    prefixes covering EN + PT). Returns 'ok' on click, else 'not found'."""
    subs = json.dumps([s.lower() for s in substrings])
    return _bp_eval(host, port, f"""
(function(){{
  const subs = {subs};
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const t of tabs) {{
    const txt = (t.textContent || '').toLowerCase();
    if (subs.some(s => txt.includes(s))) {{ t.click(); return 'ok'; }}
  }}
  return 'not found';
}})()
""") or "no-result"


def _wait_bp_idle(host, port, tries=20):
    """Wait until the BP main thread is responsive again. A Runtime.evaluate
    queues behind whatever is running on the main thread, so a returning eval
    means the thread is free — this naturally waits out a heavy on-mount
    computation (the Suggestions/Statistics library scan) without guessing a
    fixed delay. Returns True once two consecutive probes come back promptly."""
    free = 0
    for _ in range(tries):
        if _bp_eval(host, port, "Date.now()") is not None:
            free += 1
            if free >= 2:
                return True
        else:
            free = 0
        time.sleep(0.4)
    return False


def _capture_tab(sjc, host, port, out_dir, filename, *substrings, settle=0.8, wait_idle=False):
    if not _open_settings(sjc, host, port):
        return {}
    if _switch_tab(host, port, *substrings) != "ok":
        return {}
    # Heavy tabs resolve stats off the mount commit; wait for the main thread to
    # come back before capturing so we don't shoot a half-painted/frozen frame.
    if wait_idle:
        _wait_bp_idle(host, port)
    time.sleep(settle)
    p = capture_bigpicture(host, port, out_dir / filename)
    _dismiss_bp_modal(host, port)
    return {filename: p} if p else {}


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
    # "Profiles" (EN) / "Perfis" (PT).
    return _capture_tab(sjc, host, port, out_dir, "settings-profiles.png", "prof", "perf", settle=0.7)


@register("settings_suggestions")
def settings_suggestions(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # New tab (split out of Statistics). "Suggestions" (EN) / "Sugestões" (PT).
    return _capture_tab(sjc, host, port, out_dir, "settings-suggestions.png", "suggestion", "sugest", settle=1.0, wait_idle=True)


@register("settings_statistics")
def settings_statistics(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # "Statistics" (EN) / "Estatísticas" (PT) — now charts + usage breakdowns.
    return _capture_tab(sjc, host, port, out_dir, "settings-statistics.png", "statistic", "estat", settle=1.0, wait_idle=True)


@register("settings_shortcuts")
def settings_shortcuts(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # Restructured (Card actions + Navigation sections, sidecar bindings).
    # "Shortcuts" (EN) / "Atalhos" (PT).
    return _capture_tab(sjc, host, port, out_dir, "settings-shortcuts.png", "shortcut", "atalho")


@register("settings_integrations")
def settings_integrations(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # "Integrations" (EN) / "Integrações" (PT).
    return _capture_tab(sjc, host, port, out_dir, "settings-integrations.png", "integ", settle=0.7)


@register("settings_advanced")
def settings_advanced(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # "Advanced" (EN) / "Avançado" (PT) — now verbose-logging toggle + colour log list.
    return _capture_tab(sjc, host, port, out_dir, "settings-advanced.png", "advanc", "avanç", settle=0.7)
