"""QAM scenarios. Each one opens the QAM, navigates to the Deck Shelves
plugin tab, expands all collapsed sections, optionally scrolls to a target
section, then captures the QAM popup target clipped to the visible portrait
panel (matching the legacy aspect-ratio validation)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import navigate_to_ds_qam, close_qam, _qam_eval, expand_qam_sections
from ..lib.capture import capture_qam
from ._registry import register


def _scroll_qam_to_section(host: str, port: int, section_id: str) -> str:
    """Scroll to a CollapsibleSection by its data-ds-section id.

    Decky's Focusable may not forward data-* props to the DOM, so falls back
    to index-based lookup (known section order) then fractional scroll.
    """
    # Known section order: behavior=0, shelves=1, smart=2, visual_global=3, saved_filters=4
    # Known fractional scroll positions (rough) for each section.
    order_map = {"behavior": 0, "shelves": 1, "smart": 2, "visual_global": 3, "saved_filters": 4}
    frac_map  = {"behavior": 0.0, "shelves": 0.05, "smart": 0.35, "visual_global": 0.65, "saved_filters": 0.85}
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
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    out = out_dir / "qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"qam.png": p} if p else {}


@register("smart_shelves_qam")
def smart_shelves_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Smart Shelves section (expanded)."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    # Scroll to the smart section header (data-ds-section="smart").
    _scroll_qam_to_section(host, port, "smart")
    time.sleep(0.8)
    out = out_dir / "smart-shelves-qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"smart-shelves-qam.png": p} if p else {}


@register("global_toggles")
def global_toggles(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Apply globally / Visual section."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _scroll_qam_to_section(host, port, "visual_global")
    time.sleep(0.8)
    out = out_dir / "global-toggles.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"global-toggles.png": p} if p else {}


@register("saved_filters_qam")
def saved_filters_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to Saved Filters (when at least one filter exists)."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _scroll_qam_to_section(host, port, "saved_filters")
    time.sleep(0.8)
    out = out_dir / "saved-filters-qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"saved-filters-qam.png": p} if p else {}


@register("import_overflow")
def import_overflow(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM with the import overflow menu open."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _qam_eval(host, port, """
(function(){
  const btns = document.querySelectorAll('.deck-shelves-action-btn button, button[aria-label]');
  for (const b of btns) {
    const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
    if (lbl.includes('import') || lbl.includes('overflow') || lbl.includes('more')) {
      b.click(); return 'clicked:' + lbl;
    }
    if ((b.textContent || '').trim() === '' && b.querySelector('svg circle')) {
      b.click(); return 'clicked-circle';
    }
  }
  return 'not found';
})()
""")
    time.sleep(1.2)
    out = out_dir / "import-overflow.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"import-overflow.png": p} if p else {}
