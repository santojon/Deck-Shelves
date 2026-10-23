"""Overlay scenarios: Quick Search and the shelf Side Nav, both over the Home.

They open through the hooks a dev build publishes for exactly this (the
controller chords they answer to can't be sent over CDP), so a release build
skips them cleanly instead of capturing a bare Home."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import ensure_bp_clean, _bp_eval
from deckprobe.screenshots.lib.capture import capture_bigpicture
from deckprobe.screenshots.lib.registry import register
from ._locale import force_locale, gamepad_glyphs

_FOCUS_FIRST_CARD = """
(function(){
  var card = document.querySelector('.ds-card[data-appid]');
  if (!card) return false;
  try { card.focus(); } catch (e) {}
  return true;
})()
"""


def _hook(sjc: Session, expr: str):
    """The overlay hooks live on the SharedJSContext realm's globalThis."""
    try:
        return sjc.evaluate(expr)
    except Exception:
        return None


def _wait_bp(host: str, port: int, selector: str, timeout: float = 6.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _bp_eval(host, port, f"!!document.querySelector({selector!r})") is True:
            return True
        time.sleep(0.3)
    return False


def _unique_card(sjc: Session, host: str, port: int):
    """A card of the first shelf that appears nowhere else on the Home and whose
    name is not part of another card's name, with that name as the query. A
    match on any other card would move the focus there and close the pill."""
    first = _bp_eval(host, port, "(function(){var s=document.querySelectorAll('.ds-shelf[data-shelfid]')[0];return s?Array.from(s.querySelectorAll('.ds-card[data-appid]')).map(function(c){return c.getAttribute('data-appid');}):[];})()") or []
    everywhere = _bp_eval(host, port, "Array.from(document.querySelectorAll('.ds-card[data-appid]')).map(function(c){return c.getAttribute('data-appid');})") or []
    ids = sorted(set(everywhere))
    names = _hook(sjc, "(function(ids){var o={};ids.forEach(function(id){try{var a=appStore.GetAppOverviewByAppID(+id);o[id]=(a&&a.display_name)||'';}catch(e){o[id]='';}});return o;})(%s)" % json.dumps(ids)) or {}
    for appid in first:
        name = (names.get(appid) or "").strip()
        if everywhere.count(appid) != 1 or len(name) < 3:
            continue
        if any(name.lower() in (other or "").lower() for key, other in names.items() if key != appid):
            continue
        return appid, name
    return None, None


@register("search")
def search(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Quick Search open over the Home, with the results for a typed query."""
    force_locale(sjc)
    ensure_bp_clean(sjc, host, port)
    appid, query = _unique_card(sjc, host, port)
    if not appid:
        return {}
    _bp_eval(host, port, f"(function(){{var c=document.querySelector('.ds-card[data-appid=\"{appid}\"]');if(c)try{{c.focus();}}catch(e){{}}return !!c;}})()")
    time.sleep(0.6)
    opened = _hook(sjc, f"(function(){{try{{return !!(window.__ds_dev_open_search&&window.__ds_dev_open_search({query!r}));}}catch(e){{return false;}}}})()")
    if opened is not True or not _wait_bp(host, port, ".ds-search-overlay"):
        _hook(sjc, "try{window.__ds_dev_close_search&&window.__ds_dev_close_search();}catch(e){}")
        return {}
    # The on-screen keyboard opens with the pill, as it does for a user; hiding
    # it closes the pill too, so the capture keeps it.
    time.sleep(3.0)
    gamepad_glyphs(host, port)
    p = capture_bigpicture(host, port, out_dir / "search.png")
    _hook(sjc, "try{window.__ds_dev_close_search&&window.__ds_dev_close_search();}catch(e){}")
    time.sleep(0.8)
    return {"search.png": p} if p else {}


@register("sidenav")
def sidenav(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """The shelf Side Nav open beside the focused card."""
    force_locale(sjc)
    ensure_bp_clean(sjc, host, port)
    _bp_eval(host, port, _FOCUS_FIRST_CARD)
    time.sleep(0.6)
    opened = _hook(sjc, "(function(){try{return !!(window.__ds_dev_open_sidenav&&window.__ds_dev_open_sidenav());}catch(e){return false;}})()")
    if opened is not True or not _wait_bp(host, port, ".ds-sidenav-overlay"):
        _hook(sjc, "try{window.__ds_dev_close_sidenav&&window.__ds_dev_close_sidenav();}catch(e){}")
        return {}
    time.sleep(2.0)
    gamepad_glyphs(host, port)
    p = capture_bigpicture(host, port, out_dir / "sidenav.png")
    _hook(sjc, "try{window.__ds_dev_close_sidenav&&window.__ds_dev_close_sidenav();}catch(e){}")
    time.sleep(0.8)
    return {"sidenav.png": p} if p else {}
