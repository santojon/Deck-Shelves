"""Per-integration screenshots for the site's TabMaster/UnifiDeck/CSS Loader
guide pages (site/integrations/*.html, built from assets/screenshots/).

Genuinely optional, in the same sense every other best-effort scenario in
this pipeline is: each one only produces a file when the real integration is
detected ACTIVE on the capture device (read from the same Advanced →
System information card the user sees, not a separate check) — a device
without TabMaster/UnifiDeck installed or without an active CSS Loader theme
simply yields no file for that scenario, same as `settings_advanced` does
when Advanced mode is off. Never fabricates a screenshot of another
project's own UI; this only ever captures Deck Shelves' own diagnostics
panel, which happens to show that integration's live-detected state.

Reuses the Advanced tab opener from `settings.py` (same UI, same forced
en-US labels) rather than duplicating it.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import _bp_eval
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register
from .settings import _open_settings, _switch_tab, _wait_bp_idle

# English labels for the diagnostics "Integrations" cards (i18n/en-US/settings.json
# > diag_tabmaster / diag_unifideck / diag_css_loader) — stable capture matches
# since screenshots force en-US regardless of the device's own locale.
_LABELS = {
    "tabmaster": "TabMaster",
    "unifideck": "UnifiDeck",
    "css_loader": "CSS Loader",
}


def _force_open_diagnostics(host: str, port: int) -> None:
    """The diagnostics CollapsibleSection (id 'adv-diagnostics') defaults to
    collapsed (count=0, no persisted state). Same localStorage key + shape
    `expand_qam_sections` already writes for the QAM's own sections — set it
    before the Settings page ever mounts this session so it opens directly,
    no header click needed."""
    _bp_eval(host, port, """
(function(){
  try {
    var KEY = 'ds-qam-sections';
    var state = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) {}
    state['adv-diagnostics'] = true;
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch(e) {}
  return 'ok';
})()
""")


def _card_state(host: str, port: int, label: str) -> str:
    """'active' / 'inactive' / 'not-found'. Reads the IntegrationCard's own
    inline opacity (1 = active, 0.6 = inactive) — set directly by React from
    the `active` boolean, not a computed/cascaded value, so this is a plain
    property read, not fragile style inference."""
    result = _bp_eval(host, port, f"""
(function(){{
  var spans = Array.from(document.querySelectorAll('span'));
  var target = spans.find(function(s){{ return (s.textContent||'').trim() === {label!r}; }});
  if (!target) return 'not-found';
  var card = target.parentElement;
  return (card && card.style && card.style.opacity === '1') ? 'active' : 'inactive';
}})()
""")
    return result or "not-found"


def _capture_integration(sjc: Session, host: str, port: int, out_dir: Path,
                          key: str, filename: str) -> Dict[str, Path]:
    _force_open_diagnostics(host, port)
    if not _open_settings(sjc, host, port):
        return {}
    if _switch_tab(host, port, "advanced") != "ok":
        return {}  # Advanced mode off — tab doesn't exist, same as settings_advanced
    _wait_bp_idle(host, port)
    time.sleep(1.0)
    state = _card_state(host, port, _LABELS[key])
    if state != "active":
        return {}  # not installed / not detected on this device — genuinely optional
    p = capture_bigpicture(host, port, out_dir / filename)
    return {filename: p} if p else {}


@register("integration_tabmaster")
def integration_tabmaster(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    return _capture_integration(sjc, host, port, out_dir, "tabmaster", "integration-tabmaster.png")


@register("integration_unifideck")
def integration_unifideck(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    return _capture_integration(sjc, host, port, out_dir, "unifideck", "integration-unifideck.png")


@register("integration_css_loader")
def integration_css_loader(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    return _capture_integration(sjc, host, port, out_dir, "css_loader", "integration-css-loader.png")
