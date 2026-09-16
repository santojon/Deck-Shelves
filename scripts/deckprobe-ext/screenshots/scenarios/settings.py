"""Settings page tabs — reached by a direct route nav (`/deck-shelves/settings`,
registered via `routerHook.addRoute` in `index.tsx`), not the QAM gear icon.

Shelves, Profiles, Backup, Shortcuts, Suggestions and Statistics are visible by
default (Shortcuts/Suggestions/Statistics hide in Light mode). Integrations and
Advanced only render with Advanced mode on, so those are best-effort: if the tab
is absent the scenario returns no file.

Screenshots are captured with the UI forced to en-US (see the settings opener),
so tab matching uses plain English labels.

Previously went through the QAM (open panel → click Decky tab → click Deck
Shelves plugin entry → click the gear icon) for the same reason `about.py`
used to: `nav.py`'s own `navigate()` called an unconditional, unrelated
`m_Navigator.LibraryTab()` before ever trying the route. Fixed there —
`inst.Navigate('/deck-shelves/settings')` reaches this page directly, no
QAM interaction (and its own unreliable tab-selection state) involved.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import navigate_settings, _bp_eval, _dismiss_bp_modal
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register
from ._locale import force_english

_LANDED_CHECK = "document.querySelectorAll('[role=\"tab\"]').length > 0"


def _open_settings(sjc: Session, host: str, port: int) -> bool:
    force_english(sjc)
    _dismiss_bp_modal(host, port)
    navigate_settings(sjc, settle_ms=2000)
    if _bp_eval(host, port, _LANDED_CHECK) is True:
        return True
    navigate_settings(sjc, settle_ms=1500)
    return _bp_eval(host, port, _LANDED_CHECK) is True


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
    return _capture_tab(sjc, host, port, out_dir, "settings-profiles.png", "profiles", settle=0.7)


@register("settings_suggestions")
def settings_suggestions(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # New tab (split out of Statistics).
    return _capture_tab(sjc, host, port, out_dir, "settings-suggestions.png", "suggestions", settle=1.0, wait_idle=True)


@register("settings_statistics")
def settings_statistics(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # Charts + usage breakdowns.
    return _capture_tab(sjc, host, port, out_dir, "settings-statistics.png", "statistics", settle=1.0, wait_idle=True)


@register("settings_shortcuts")
def settings_shortcuts(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # Restructured (Card actions + Navigation sections, sidecar bindings).
    return _capture_tab(sjc, host, port, out_dir, "settings-shortcuts.png", "shortcuts")


@register("settings_integrations")
def settings_integrations(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    return _capture_tab(sjc, host, port, out_dir, "settings-integrations.png", "integrations", settle=0.7)


@register("settings_advanced")
def settings_advanced(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    # Verbose-logging toggle + colour log list.
    return _capture_tab(sjc, host, port, out_dir, "settings-advanced.png", "advanced", settle=0.7)
