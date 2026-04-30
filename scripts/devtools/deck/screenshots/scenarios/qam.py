"""QAM scenarios: panel itself, smart shelves section, saved filters,
global toggles, hidden shelves view, reset confirm."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import open_qam, close_qam, click_selector, await_selector
from ..lib.capture import capture_qam
from ._registry import register


@register("qam")
def qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Plain QAM with the Deck Shelves panel visible."""
    open_qam(sjc, settle_ms=2000)
    await_selector(sjc, "[id^='quickaccess_content_']", timeout_ms=4000)
    out = out_dir / "qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"qam.png": p} if p else {}


@register("smart_shelves_qam")
def smart_shelves_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Smart Shelves section."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const sec = document.querySelector('[data-ds-section="smart"]');
  if (sec) sec.scrollIntoView({block:'center'});
  return 'ok';
})()
""")
    time.sleep(1.0)
    out = out_dir / "smart-shelves-qam.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"smart-shelves-qam.png": p} if p else {}


@register("global_toggles")
def global_toggles(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to the Apply globally section."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const sec = document.querySelector('[data-ds-section="visual_global"]') ||
              document.querySelector('[data-ds-section="apply_globally"]');
  if (sec) sec.scrollIntoView({block:'center'});
  return 'ok';
})()
""")
    time.sleep(1.0)
    out = out_dir / "global-toggles.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"global-toggles.png": p} if p else {}


@register("saved_filters_qam")
def saved_filters_qam(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM scrolled to Saved Filters (when at least one filter exists)."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const sec = document.querySelector('[data-ds-section="saved_filters"]');
  if (sec) sec.scrollIntoView({block:'center'});
  return 'ok';
})()
""")
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
