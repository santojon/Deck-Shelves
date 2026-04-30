"""Home screen scenarios: bare home, with shelves rendered, hero focus."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import navigate_home, await_selector
from ..lib.capture import capture_bigpicture
from ._registry import register


@register("home")
def home(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Plain home screen — no QAM, no modal."""
    navigate_home(sjc, settle_ms=2500)
    out = out_dir / "home.png"
    p = capture_bigpicture(host, port, out)
    return {"home.png": p} if p else {}


@register("home_shelves")
def home_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Home with at least one Deck Shelves shelf rendered."""
    navigate_home(sjc, settle_ms=2500)
    await_selector(sjc, ".ds-shelf[data-shelfid]", timeout_ms=4000)
    time.sleep(1.0)
    out = out_dir / "home-shelves.png"
    p = capture_bigpicture(host, port, out)
    return {"home-shelves.png": p} if p else {}


@register("home_hero")
def home_hero(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Home with a focused card showing the hero background overlay."""
    navigate_home(sjc, settle_ms=2500)
    await_selector(sjc, ".ds-card", timeout_ms=4000)
    sjc.evaluate("""
(function(){
  const c = document.querySelector('.ds-card');
  if (!c) return 'no card';
  c.focus();
  c.classList.add('gpfocus');
  return 'ok';
})()
""")
    time.sleep(1.5)
    out = out_dir / "home-hero.png"
    p = capture_bigpicture(host, port, out)
    return {"home-hero.png": p} if p else {}


@register("home_hide_recents")
def home_hide_recents(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Home with the native recents row hidden — first DS shelf promoted."""
    navigate_home(sjc, settle_ms=2500)
    sjc.evaluate("""
(function(){
  try { localStorage.setItem('__QA_ALL_SHELVES_HIDE_RECENTS__', '1'); } catch{}
  return 'ok';
})()
""")
    time.sleep(0.5)
    navigate_home(sjc, settle_ms=2500)
    await_selector(sjc, ".ds-shelf", timeout_ms=4000)
    time.sleep(1.0)
    out = out_dir / "home-hide-recents.png"
    p = capture_bigpicture(host, port, out)
    return {"home-hide-recents.png": p} if p else {}
