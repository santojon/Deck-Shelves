"""Home screen scenarios: bare home, with shelves rendered, hero focus."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from devkit.screenshots.lib.cdp import Session
from devkit.screenshots.lib.nav import navigate_home, ensure_bp_clean, _bp_eval
from devkit.screenshots.lib.capture import capture_bigpicture
from devkit.screenshots.lib.registry import register


@register("home")
def home(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Plain home screen — no QAM, no modal."""
    ensure_bp_clean(sjc, host, port)
    # Scroll to top via JS (no mouse events → no hover state in capture)
    _bp_eval(host, port, """
(function(){
  var mount = document.getElementById('deck-shelves-home-root');
  var cur = mount ? mount.parentElement : null;
  while (cur) {
    try {
      var cs = getComputedStyle(cur);
      var oy = (cs.overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) {
        cur.scrollTop = 0; return 'scrolled';
      }
    } catch(_){}
    cur = cur.parentElement;
  }
  return 'no-scrollable';
})()
""")
    time.sleep(1.0)
    out = out_dir / "home.png"
    p = capture_bigpicture(host, port, out)
    return {"home.png": p} if p else {}


@register("home_shelves")
def home_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Home with DS shelves visible — second card focused after ArrowRight."""
    ensure_bp_clean(sjc, host, port)
    # Scroll to second shelf via JS scrollTop (no mouse events → no hover)
    _bp_eval(host, port, """
(function(){
  var shelves = Array.from(document.querySelectorAll('.ds-shelf'));
  if (shelves.length < 2) return { err: 'fewer-than-2', count: shelves.length };
  var mount = document.getElementById('deck-shelves-home-root');
  var scr = mount ? mount.parentElement : null;
  while (scr) {
    try {
      var cs = getComputedStyle(scr);
      var oy = (cs.overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scr.scrollHeight > scr.clientHeight) break;
    } catch(_){}
    scr = scr.parentElement;
  }
  if (!scr) return { err: 'no-scrollable' };
  var shelf = shelves[1];
  var shelfRect = shelf.getBoundingClientRect();
  var scrRect = scr.getBoundingClientRect();
  var target = Math.max(0, Math.round(scr.scrollTop + (shelfRect.top - scrRect.top) - 200));
  scr.scrollTop = target;
  return { ok: true, scrollTop: scr.scrollTop };
})()
""")
    time.sleep(1.5)
    # Focus first card then step right for deterministic focus state
    _bp_eval(host, port, """
(function(){
  const card = document.querySelector('.ds-shelf[data-shelfid] .ds-card');
  if (card) try { card.focus(); } catch {}
  return 'ok';
})()
""")
    time.sleep(0.6)
    _bp_eval(host, port, """
(function(){
  const evt = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  (document.activeElement || document).dispatchEvent(evt);
  document.dispatchEvent(evt);
  return 'ok';
})()
""")
    time.sleep(3.0)
    out = out_dir / "home-shelves.png"
    p = capture_bigpicture(host, port, out)
    return {"home-shelves.png": p} if p else {}


@register("home_hero")
def home_hero(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Home with a focused card showing the hero background overlay."""
    ensure_bp_clean(sjc, host, port)
    # Wait for DS to render after navigation (fixed wait — polling many rapid
    # CDP sessions can exhaust the Steam CEF connection handler).
    time.sleep(2.5)
    _bp_eval(host, port, """
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
    ensure_bp_clean(sjc, host, port)
    # Set localStorage flag in Big Picture window (not SJC)
    _bp_eval(host, port, """
(function(){
  try { localStorage.setItem('__QA_ALL_SHELVES_HIDE_RECENTS__', '1'); } catch{}
  return 'ok';
})()
""")
    time.sleep(0.5)
    navigate_home(sjc, settle_ms=2500)
    # Fixed wait instead of polling — rapid CDP sessions exhaust the connection handler.
    time.sleep(2.5)
    out = out_dir / "home-hide-recents.png"
    p = capture_bigpicture(host, port, out)
    # Clean up: remove the flag so subsequent scenarios see normal home layout.
    _bp_eval(host, port, """
(function(){
  try { localStorage.removeItem('__QA_ALL_SHELVES_HIDE_RECENTS__'); } catch{}
  return 'ok';
})()
""")
    return {"home-hide-recents.png": p} if p else {}
