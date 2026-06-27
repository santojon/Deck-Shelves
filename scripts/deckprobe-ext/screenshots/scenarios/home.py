"""Home screen scenarios: bare home, with shelves rendered."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import ensure_bp_clean, _bp_eval
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register


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
