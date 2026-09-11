"""Per-integration screenshots for the site's TabMaster/UnifiDeck/CSS Loader
guide pages (site/integrations/*.html, built from assets/screenshots/).

Each one shows the actual, integration-specific UI rather than a generic
diagnostics card — genuinely optional (best-effort) in the same sense every
other scenario in this pipeline is: a device without TabMaster installed, or
without an active CSS Loader theme, simply yields no file for that scenario,
same as `settings_advanced` does when Advanced mode is off.

- TabMaster: the QAM's own "Import from TabMaster" flow.
- CSS Loader: the QAM's Experimental section, showing its force-themes toggle
  (only rendered when a CSS Loader theme is actually active).
- UnifiDeck: no dedicated in-QAM surface exists, so this one keeps using the
  Advanced → System information diagnostics card (reused from `settings.py`).
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import _bp_eval, expand_qam_sections, close_qam
from deckprobe.screenshots.lib.capture import capture_bigpicture, capture_qam
from deckprobe.screenshots.lib.registry import register
from .modals import _open_qam, _click_action, dismiss_bp_modals
from .qam import _scroll_qam_to_section
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


def _reset_scroll(host: str, port: int) -> None:
    """Reset every scrolled-down container back to the top. A modal/panel
    can mount already scrolled — gamepad-nav auto-focuses the first
    focusable row on mount, which can carry the container's own heading
    off-screen with it if that row sits below the fold."""
    _bp_eval(host, port, """
(function(){
  document.querySelectorAll('*').forEach(function(el){ if (el.scrollTop > 0) el.scrollTop = 0; });
})()
""")


def _scroll_to_label(host: str, port: int, label: str) -> bool:
    """Scroll the element carrying `label` (an IntegrationCard's own text)
    into view. Diagnostics renders Hardware → Software → Integrations →
    Configs as one long card — capturing right after opening it only ever
    shows the Hardware block at the top; the actual check this scenario
    exists for is further down."""
    return _bp_eval(host, port, f"""
(function(){{
  var spans = Array.from(document.querySelectorAll('span'));
  var target = spans.find(function(s){{ return (s.textContent||'').trim() === {label!r}; }});
  if (!target) return false;
  target.scrollIntoView({{ behavior: 'instant', block: 'center' }});
  return true;
}})()
""") is True


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
    _scroll_to_label(host, port, _LABELS[key])
    time.sleep(0.5)
    p = capture_bigpicture(host, port, out_dir / filename)
    return {filename: p} if p else {}


@register("integration_tabmaster")
def integration_tabmaster(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """The QAM's "Import from TabMaster" flow — only registered (and only
    clickable) when TabMaster is actually detected on this device."""
    if not _open_qam(sjc, host, port):
        return {}
    expand_qam_sections(host, port)
    if not _click_action(host, port, "import_tabmaster"):
        return {}  # TabMaster not installed — button doesn't exist, genuinely optional
    time.sleep(2.5)
    # The modal mounts with its own scroll container already scrolled down —
    # gamepad-nav auto-focuses a tab tile below the fold on mount, which
    # carries the whole "Import from TabMaster" title off-screen with it.
    # Confirmed live: without this, the capture shows a bare list of tiles
    # with no heading at all.
    _reset_scroll(host, port)
    out = out_dir / "integration-tabmaster.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"integration-tabmaster.png": p} if p else {}


@register("integration_unifideck")
def integration_unifideck(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    return _capture_integration(sjc, host, port, out_dir, "unifideck", "integration-unifideck.png")


@register("integration_css_loader")
def integration_css_loader(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """The QAM's Experimental section, scrolled into view — its force-themes
    toggle only renders when a CSS Loader theme is actually active, so an
    empty capture here would mean the section is present but the toggle
    itself isn't (same "genuinely optional" contract as the other scenarios,
    just not separately checked — the toggle's own render gate does it)."""
    if not _open_qam(sjc, host, port):
        return {}
    expand_qam_sections(host, port)
    _scroll_qam_to_section(host, port, "experimental")
    time.sleep(0.8)
    out = out_dir / "integration-css-loader.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"integration-css-loader.png": p} if p else {}
