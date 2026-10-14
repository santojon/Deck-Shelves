"""QAM scenarios. Each one opens the QAM, navigates to the Deck Shelves
plugin tab, expands all collapsed sections, optionally scrolls to a target
section, then captures the QAM popup target clipped to the visible portrait
panel (matching the legacy aspect-ratio validation)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import navigate_to_ds_qam, close_qam, _qam_eval, expand_qam_sections
from deckprobe.screenshots.lib.capture import capture_qam
from deckprobe.screenshots.lib.registry import register
from ._locale import force_locale, gamepad_glyphs


def _scroll_qam_to_section(host: str, port: int, section_id: str) -> str:
    """Scroll to a CollapsibleSection by its data-ds-section id.

    Decky's Focusable may not forward data-* props to the DOM, so falls back
    to index-based lookup (known section order) then fractional scroll.
    """
    # Section order as the panel renders them (deckprobe.config.json QAM_SECTIONS),
    # and rough fractional scroll positions for each.
    order_map = {"profiles": 0, "behavior": 1, "additional": 2, "navigation": 3, "online": 4, "experimental": 5,
                 "shelves": 6, "visual_global": 7, "saved_filters": 8}
    frac_map  = {"profiles": 0.0, "behavior": 0.1, "additional": 0.2, "navigation": 0.3, "online": 0.35, "experimental": 0.45,
                 "shelves": 0.55, "visual_global": 0.75, "saved_filters": 0.9}
    idx  = order_map.get(section_id, -1)
    frac = frac_map.get(section_id, 0.5)

    expr = f"""
(function() {{
  // Primary: data-ds-section attribute (forwarded by Focusable on newer Decky).
  var hdr = document.querySelector('[data-ds-section="{section_id}"]');
  if (hdr) {{ hdr.scrollIntoView({{ behavior: 'instant', block: 'start' }}); return 'attr'; }}

  // Fallback 1: Nth .ds-collapsible-header by known section order.
  var all = Array.from(document.querySelectorAll('.ds-collapsible-header'));
  var idx = {idx};
  if (idx >= 0 && all[idx]) {{
    all[idx].scrollIntoView({{ behavior: 'instant', block: 'start' }});
    return 'idx:' + idx;
  }}

  // Fallback 2: fractional scrollTop on the QAM scope.
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (scope) {{
    scope.scrollTop = Math.floor(scope.scrollHeight * {frac});
    return 'frac:{frac}';
  }}
  return 'no-scroll';
}})()
"""
    result = _qam_eval(host, port, expr) or "no-result"
    time.sleep(0.5)
    return result


def _scroll_qam_to_top(host: str, port: int) -> str:
    """Scroll the panel back to its top. The scrolling element is an ancestor
    of the plugin's scope (the menu's own panel), so resetting the scope's
    scrollTop alone does nothing after an earlier scenario scrolled down."""
    result = _qam_eval(host, port, """
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (!scope) return 'no-scope';
  var el = scope, n = 0;
  while (el) { if (el.scrollTop > 0) { el.scrollTop = 0; n++; } el = el.parentElement; }
  var first = scope.firstElementChild;
  if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });
  return 'reset:' + n;
})()
""") or "no-result"
    time.sleep(0.5)
    return result


def _scroll_qam_to_text(host: str, port: int, *needles: str) -> str:
    """Scroll the QAM scope to the first text node containing any needle.
    Runs in the QAM popup target (not SJC) so the DS DOM is reachable."""
    needle_js = ", ".join(repr(n.lower()) for n in needles)
    expr = f"""
(function() {{
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (!scope) return 'no-scope';
  var needles = [{needle_js}];
  var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  var node;
  while (node = walker.nextNode()) {{
    var txt = (node.textContent || '').trim().toLowerCase();
    if (txt.length > 2 && txt.length < 80) {{
      for (var i = 0; i < needles.length; i++) {{
        if (txt.indexOf(needles[i]) !== -1) {{
          var el = node.parentElement;
          if (el) {{ el.scrollIntoView({{ behavior: 'instant', block: 'start' }}); return 'scrolled:' + txt.substring(0, 30); }}
        }}
      }}
    }}
  }}
  scope.scrollTop = Math.floor(scope.scrollHeight * 0.6);
  return 'fallback-scroll';
}})()
"""
    return _qam_eval(host, port, expr) or "no-result"


@register("qam")
def qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM at the top of the Deck Shelves panel."""
    force_locale(sjc)
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _scroll_qam_to_top(host, port)
    out = out_dir / "qam.png"
    gamepad_glyphs(host, port)
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"qam.png": p} if p else {}


@register("smart_shelves_qam")
def smart_shelves_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the smart shelves: their own section when the panel has
    one, otherwise the smart rows at the end of the Shelves list."""
    force_locale(sjc)
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _qam_eval(host, port, """
(function(){
  var hdr = document.querySelector('[data-ds-section="smart"]');
  if (hdr) { hdr.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'section'; }
  var row = document.querySelector('[data-ds-smart-actions]');
  if (row) { row.scrollIntoView({ behavior: 'instant', block: 'center' }); return 'row'; }
  return 'none';
})()
""")
    time.sleep(0.8)
    out = out_dir / "smart-shelves-qam.png"
    gamepad_glyphs(host, port)
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"smart-shelves-qam.png": p} if p else {}


@register("global_toggles")
def global_toggles(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Apply globally / Visual section."""
    force_locale(sjc)
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _scroll_qam_to_section(host, port, "visual_global")
    time.sleep(0.8)
    out = out_dir / "global-toggles.png"
    gamepad_glyphs(host, port)
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"global-toggles.png": p} if p else {}


@register("saved_filters_qam")
def saved_filters_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to Saved Filters (when at least one filter exists)."""
    force_locale(sjc)
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    # The Saved Filters section only exists when the user has saved a filter.
    # Skip (don't capture the wrong section) when it's absent.
    has = _qam_eval(host, port, "!!document.querySelector('[data-ds-section=\"saved_filters\"]')")
    if has is not True:
        close_qam(sjc)
        return {}
    _scroll_qam_to_section(host, port, "saved_filters")
    time.sleep(0.8)
    out = out_dir / "saved-filters-qam.png"
    gamepad_glyphs(host, port)
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"saved-filters-qam.png": p} if p else {}


@register("sidecar")
def sidecar(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM with the "Configurações" sidecar expanded and populated.

    Dev builds expose `__ds_dev_open_sidecar()`, which fires the same path as
    a dpad-right chord: it postMessages the QAM's opener to widen the
    compositor window AND flips the expand store, so the sidecar renders with
    content (flipping the store alone leaves the panel at normal width and the
    sidecar paints off-screen). The hook is registered on the SharedJSContext
    realm (where DeckQAMSettings' globalThis lives), so it must be invoked via
    the SJC session — *not* `_qam_eval`, which runs in the QAM popup target
    where the hook is undefined. The sidecar DOM, however, lives in the QAM
    target, so we verify/capture there. Skips cleanly on release builds (no
    hook) instead of capturing a non-expanded panel."""
    force_locale(sjc)
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    time.sleep(1.0)
    opened = sjc.evaluate(
        "(function(){try{return !!(window.__ds_dev_open_sidecar && window.__ds_dev_open_sidecar());}catch(e){return false;}})()"
    )
    time.sleep(1.6)
    expanded = _qam_eval(host, port, "!!document.querySelector('.deck-shelves-qam-sidecar .ds-eye-btn')")
    if opened is not True or expanded is not True:
        try:
            sjc.evaluate("try{window.__ds_dev_close_sidecar&&window.__ds_dev_close_sidecar();}catch(e){}")
        except Exception:
            pass
        close_qam(sjc)
        return {}
    out = out_dir / "sidecar.png"
    gamepad_glyphs(host, port)
    p = capture_qam(host, port, out)
    try:
        sjc.evaluate("try{window.__ds_dev_close_sidecar&&window.__ds_dev_close_sidecar();}catch(e){}")
    except Exception:
        pass
    close_qam(sjc)
    return {"sidecar.png": p} if p else {}
