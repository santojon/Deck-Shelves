"""Timed driving steps shared by the feature-script video scenarios: key
presses into the Big Picture window (the GamepadUI reads arrow keys as a
virtual D-pad), focus and scroll helpers over the plugin's own DOM, route
changes through the dev hooks, and a small recording wrapper around the
runner's `record` so each scenario body stays a plain timed sequence.
Everything here is best-effort — a scenario keeps going past a missed step
so a recording never aborts halfway."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from deckprobe.screenshots.lib.cdp import Session, open_session
from deckprobe.screenshots.lib import nav
from ._screencast import record_timed as record
from ._routes import navigate_route
from ._locale import force_locale

KEYS = {
    "left": ("ArrowLeft", 37), "right": ("ArrowRight", 39), "up": ("ArrowUp", 38), "down": ("ArrowDown", 40),
    "enter": ("Enter", 13), "escape": ("Escape", 27), "tab": ("Tab", 9),
}
FPS = 10


@dataclass
class Context:
    host: str
    port: int
    sjc: Session
    started: float = 0.0
    cues: List[Tuple[float, str]] = field(default_factory=list)

    def cue(self, label: str) -> None:
        """Mark a moment (voice-over / cut point) with its timestamp."""
        at = time.time() - self.started
        self.cues.append((at, label))
        print(f"  [{at:6.1f}s] {label}")


def run(name: str, sjc: Session, host: str, port: int, out_dir: Path, body: Callable[[Context], None],
        target: str = "Big Picture", setup: Optional[Callable[[Context], None]] = None) -> Dict[str, Path]:
    """Record `body` driving the `target` window (the Big Picture window, or
    "QuickAccess" for the Quick Access menu, which is its own window) into
    `<out_dir>/<name>.mp4` and write the cue list beside it (`<name>.cues.txt`).
    `setup` runs before the recording starts (a settled Home, the locale)."""
    fname = f"{name}.mp4"
    ctx = Context(host=host, port=port, sjc=sjc, started=time.time())
    if setup:
        setup(ctx)
        ctx.started = time.time()
    with record(host, port, target, out_dir, fname, fps=FPS):
        body(ctx)
    (out_dir / f"{name}.cues.txt").write_text("".join(f"{t:6.1f}s  {label}\n" for t, label in ctx.cues), encoding="utf-8")
    return {fname: out_dir / fname}


def wait(seconds: float) -> None:
    time.sleep(seconds)


GAMEPAD_GLYPHS = "try{FocusNavController.UpdateSourceToGamepad(true)}catch(e){}"


def press(host: str, port: int, key: str, times: int = 1, pause: float = 0.35, session: Optional[Session] = None) -> None:
    """Press a key in the Big Picture window `times` times (`left/right/up/down/enter/escape`).
    Each press flips Steam's footer hints to keyboard glyphs, so the controller
    glyphs are put back right after every key."""
    name, vk = KEYS[key]
    own = session is None
    sess = session or open_session(host, port, "Big Picture")
    try:
        sjc = open_session(host, port, "SharedJSContext")
    except Exception:  # noqa: BLE001
        sjc = None
    try:
        def restore() -> None:
            if sjc is None:
                return
            try:
                sjc.evaluate(GAMEPAD_GLYPHS)
            except Exception:  # noqa: BLE001
                pass

        for _ in range(times):
            for kind in ("keyDown", "keyUp"):
                try:
                    sess.call("Input.dispatchKeyEvent", {
                        "type": kind, "key": name, "code": name, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
                    }, timeout=3.0)
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(0.06)
            # Steam applies the key a beat after the call returns: restore the
            # glyphs once the press has landed, and again at the end of the pause.
            time.sleep(min(0.15, pause))
            restore()
            time.sleep(max(0.0, pause - 0.15))
            restore()
    finally:
        if own:
            sess.close()
        if sjc is not None:
            sjc.close()


def gamepad_glyphs(sjc: Session) -> None:
    run_in_plugin(sjc, GAMEPAD_GLYPHS)


def _restore_glyphs(host: str, port: int) -> None:
    """Controller glyphs back after an Escape or a navigation sent over CDP."""
    try:
        sjc = open_session(host, port, "SharedJSContext")
        try:
            sjc.evaluate(GAMEPAD_GLYPHS)
        finally:
            sjc.close()
    except Exception:  # noqa: BLE001
        pass


def scroll_home_top(host: str, port: int) -> None:
    """Scroll the Home back to its top (a previous step may have left it low)."""
    nav._bp_eval(host, port, """
(function(){
  const mount = document.getElementById('deck-shelves-home-root');
  let el = mount ? mount.parentElement : null;
  while (el) {
    try {
      const oy = (getComputedStyle(el).overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) { el.scrollTop = 0; return true; }
    } catch (e) {}
    el = el.parentElement;
  }
  return false;
})()""")


def settle_home(host: str, port: int, timeout: float = 12.0) -> bool:
    """Wait until the first shelf sits in the recents row with its cards."""
    scroll_home_top(host, port)
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = nav._bp_eval(host, port, """
(function(){
  const shelf = document.querySelector('.ds-shelf[data-shelfid]');
  if (!shelf) return 0;
  const cards = shelf.querySelectorAll('.ds-card').length;
  const top = shelf.getBoundingClientRect().top;
  return cards > 0 && top > -100 && top < 420 ? cards : 0;
})()""")
        if isinstance(r, int) and r > 0:
            return True
        time.sleep(0.5)
    return False


def prepare_home(sjc: Session, host: str, port: int, timeout: float = 25.0) -> bool:
    """Before a recording: the plugin UI in the recording locale, a clean Home,
    and the first shelf settled in the recents row with its cards (the native
    row shows for a few seconds after a navigation until the plugin takes it)."""
    force_locale(sjc)
    nav.ensure_bp_clean(sjc, host, port)
    ok = settle_home(host, port, timeout)
    time.sleep(1.5)
    gamepad_glyphs(sjc)
    return ok


def focus_first_card(host: str, port: int, shelf_index: int = 0) -> bool:
    """Focus the first card of the n-th shelf (DOM focus; the nav tree follows)."""
    r = nav._bp_eval(host, port, f"""
(function(){{
  const shelves = Array.from(document.querySelectorAll('.ds-shelf[data-shelfid]'));
  const shelf = shelves[{shelf_index}]; if (!shelf) return false;
  const card = shelf.querySelector('.ds-card'); if (!card) return false;
  try {{ card.scrollIntoView({{ block: 'center' }}); card.focus(); }} catch (e) {{}}
  return true;
}})()""")
    return r is True


def scroll_to_shelf(host: str, port: int, shelf_index: int, offset: int = 200) -> bool:
    r = nav._bp_eval(host, port, f"""
(function(){{
  const shelves = Array.from(document.querySelectorAll('.ds-shelf[data-shelfid]'));
  const shelf = shelves[{shelf_index}]; if (!shelf) return false;
  const mount = document.getElementById('deck-shelves-home-root');
  let scr = mount ? mount.parentElement : null;
  while (scr) {{
    try {{ const oy = (getComputedStyle(scr).overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scr.scrollHeight > scr.clientHeight) break; }} catch (e) {{}}
    scr = scr.parentElement;
  }}
  if (!scr) return false;
  const a = shelf.getBoundingClientRect(), b = scr.getBoundingClientRect();
  scr.scrollTop = Math.max(0, Math.round(scr.scrollTop + (a.top - b.top) - {offset}));
  return true;
}})()""")
    return r is True


def focus_shelf(host: str, port: int, shelf_id: str, offset: int = 200) -> bool:
    """Scroll the shelf with `shelf_id` into view and focus its first card
    (waiting for the shelf to hold cards first: a shelf below the fold mounts
    its row only when it comes near)."""
    nav._bp_eval(host, port, f"(function(){{var s=document.querySelector('.ds-shelf[data-shelfid=\"{shelf_id}\"]');if(s)s.scrollIntoView({{block:'center'}});}})()")
    await_shelf_cards(host, port, shelf_id, timeout=8.0)
    r = nav._bp_eval(host, port, f"""
(function(){{
  const shelf = document.querySelector('.ds-shelf[data-shelfid="{shelf_id}"]'); if (!shelf) return false;
  const mount = document.getElementById('deck-shelves-home-root');
  let scr = mount ? mount.parentElement : null;
  while (scr) {{
    try {{ const oy = (getComputedStyle(scr).overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scr.scrollHeight > scr.clientHeight) break; }} catch (e) {{}}
    scr = scr.parentElement;
  }}
  if (scr) {{
    const a = shelf.getBoundingClientRect(), b = scr.getBoundingClientRect();
    scr.scrollTop = Math.max(0, Math.round(scr.scrollTop + (a.top - b.top) - {offset}));
  }}
  const card = shelf.querySelector('.ds-card'); if (!card) return false;
  try {{ card.focus(); }} catch (e) {{}}
  return true;
}})()""")
    return r is True


def await_shelf_cards(host: str, port: int, shelf_id: str, timeout: float = 12.0) -> bool:
    """Wait until the shelf holds cards (online shelves fill in after a fetch)."""
    deadline = time.time() + timeout
    expr = f"document.querySelectorAll('.ds-shelf[data-shelfid=\"{shelf_id}\"] .ds-card').length"
    while time.time() < deadline:
        n = nav._bp_eval(host, port, expr)
        if isinstance(n, int) and n > 0:
            return True
        time.sleep(0.5)
    return False


def click_tab(host: str, port: int, label: str) -> bool:
    """Click the page tab (Settings / About) whose label contains `label`."""
    r = nav._bp_eval(host, port, f"""
(function(){{
  const needle = {label.lower()!r};
  for (const t of document.querySelectorAll('[role="tab"]')) {{
    if ((t.textContent || '').toLowerCase().includes(needle)) {{ t.click(); return true; }}
  }}
  return false;
}})()""")
    return r is True


def click_modal_tab(host: str, port: int, label: str) -> bool:
    """Click the editor modal's tab whose label contains `label` (the UI is in
    en-US while recording: "filter", "visual", "decoration")."""
    r = nav._bp_eval(host, port, f"""
(function(){{
  const needle = {label.lower()!r};
  for (const t of document.querySelectorAll('[role="tab"]')) {{
    if ((t.textContent || '').toLowerCase().includes(needle)) {{ t.click(); return true; }}
  }}
  return false;
}})()""")
    return r is True


def await_modal(host: str, port: int, timeout: float = 8.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if nav._bp_eval(host, port, "!!document.querySelector('[class*=GenericConfirmDialog]')") is True:
            return True
        time.sleep(0.3)
    return False


def dismiss_modal(host: str, port: int) -> None:
    nav._dismiss_bp_modal(host, port)
    _restore_glyphs(host, port)


def open_profile_trigger(host: str, port: int, profile_name: str) -> bool:
    """On the Settings > Profiles tab, open the trigger editor of the row named
    `profile_name` (its second button; the first one applies the profile)."""
    r = nav._bp_eval(host, port, f"""
(function(){{
  const page = document.querySelector('.deck-shelves-settings-page'); if (!page) return false;
  const rows = Array.from(page.querySelectorAll('[style*="border-radius: 6px"]'));
  const row = rows.find(r => (r.textContent || '').includes({profile_name!r})); if (!row) return false;
  const buttons = Array.from(row.querySelectorAll('button, [role=button], [tabindex]'));
  if (buttons.length < 2) return false;
  buttons[1].click();
  return true;
}})()""")
    return r is True


def overlay_open(host: str, port: int, selector: str) -> bool:
    return nav._bp_eval(host, port, f"!!document.querySelector({selector!r})") is True


def card_query(sjc: Session, host: str, port: int, index: int = 0) -> str:
    """A search query that matches on any device: the first word (letters
    only, at least three) of the n-th card's name on the first shelf."""
    appid = nav._bp_eval(host, port, f"(function(){{var c=document.querySelectorAll('.ds-card[data-appid]');c=c[{index}]||c[0];return c?c.getAttribute('data-appid'):null;}})()")
    name = None
    if appid:
        name = run_in_plugin(sjc, f"(function(){{try{{var o=appStore.GetAppOverviewByAppID({int(appid)});return (o&&o.display_name)||null;}}catch(e){{return null;}}}})()")
    for word in str(name or "").split():
        letters = "".join(ch for ch in word if ch.isalpha())
        if len(letters) >= 3:
            return letters
    return "the"


def first_card_query(sjc: Session, host: str, port: int) -> str:
    return card_query(sjc, host, port, 0)


def shelf_count(host: str, port: int) -> int:
    r = nav._bp_eval(host, port, "document.querySelectorAll('.ds-shelf[data-shelfid]').length")
    return int(r or 0)


def home(sjc: Session, host: str, port: int) -> None:
    """Back to a settled Home (first shelf in place with its cards)."""
    nav.ensure_bp_clean(sjc, host, port)
    settle_home(host, port)
    gamepad_glyphs(sjc)


def open_qam(sjc: Session) -> None:
    nav.open_qam(sjc)


def close_qam(sjc: Session) -> None:
    nav.close_qam(sjc)


def navigate(sjc: Session, route: str, settle: float = 2.0) -> None:
    navigate_route(sjc, route, settle_ms=int(settle * 1000))


def run_in_plugin(sjc: Session, expr: str):
    """Evaluate in the SharedJSContext realm (plugin globals, dev hooks)."""
    try:
        return sjc.evaluate(expr)
    except Exception:  # noqa: BLE001
        return None
