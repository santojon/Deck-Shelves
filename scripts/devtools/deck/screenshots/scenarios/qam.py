"""QAM scenarios. Each one opens the QAM, optionally scrolls the
`.deck-shelves-qam-scope` to a target section by header text, then
captures the QAM popup target clipped to the visible portrait panel
(matching the legacy aspect-ratio validation in `validate-screenshots.mjs`)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import open_qam, close_qam
from ..lib.capture import capture_qam
from ._registry import register


def _scroll_qam_to_text(sjc: Session, *needles: str) -> str:
    """Scroll the QAM scope to the first text node containing any of the
    `needles` (case-insensitive). Falls back to a 60% scroll position when
    no match is found. Mirrors the legacy script's approach."""
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
    return sjc.evaluate(expr) or "no-result"


@register("qam")
def qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM at the top of the panel (default scroll position)."""
    open_qam(sjc, settle_ms=2000)
    out = out_dir / "qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"qam.png": p} if p else {}


@register("smart_shelves_qam")
def smart_shelves_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Smart Shelves section."""
    open_qam(sjc, settle_ms=1500)
    _scroll_qam_to_text(sjc, "smart", "prateleira")
    time.sleep(1.0)
    out = out_dir / "smart-shelves-qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"smart-shelves-qam.png": p} if p else {}


@register("global_toggles")
def global_toggles(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Apply globally / Visual section."""
    open_qam(sjc, settle_ms=1500)
    _scroll_qam_to_text(sjc, "apply globally", "aplicar globalmente", "visual global")
    time.sleep(1.0)
    out = out_dir / "global-toggles.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"global-toggles.png": p} if p else {}


@register("saved_filters_qam")
def saved_filters_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to Saved Filters (when at least one filter exists)."""
    open_qam(sjc, settle_ms=1500)
    _scroll_qam_to_text(sjc, "saved filter", "filtro salvo")
    time.sleep(1.0)
    out = out_dir / "saved-filters-qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"saved-filters-qam.png": p} if p else {}


@register("import_overflow")
def import_overflow(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM with the import overflow menu open (requires 2+ import descriptors).
    Falls back to a no-op snapshot when fewer are registered."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const btns = document.querySelectorAll('.deck-shelves-action-btn button');
  for (const b of btns) {
    if ((b.textContent || '').trim() === '' && b.querySelector('svg circle')) {
      b.click();
      return 'opened';
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
