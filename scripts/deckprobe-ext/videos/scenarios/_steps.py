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
from deckprobe.videos.lib.capture import record

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


def run(name: str, sjc: Session, host: str, port: int, out_dir: Path, body: Callable[[Context], None]) -> Dict[str, Path]:
    """Record `body` driving the Big Picture window into `<out_dir>/<name>.mp4`
    and write the cue list beside it (`<name>.cues.txt`)."""
    fname = f"{name}.mp4"
    ctx = Context(host=host, port=port, sjc=sjc, started=time.time())
    with record(host, port, "Big Picture", out_dir, fname, fps=FPS):
        body(ctx)
    (out_dir / f"{name}.cues.txt").write_text("".join(f"{t:6.1f}s  {label}\n" for t, label in ctx.cues), encoding="utf-8")
    return {fname: out_dir / fname}


def wait(seconds: float) -> None:
    time.sleep(seconds)


def press(host: str, port: int, key: str, times: int = 1, pause: float = 0.35, session: Optional[Session] = None) -> None:
    """Press a key in the Big Picture window `times` times (`left/right/up/down/enter/escape`)."""
    name, vk = KEYS[key]
    own = session is None
    sess = session or open_session(host, port, "Big Picture")
    try:
        for _ in range(times):
            for kind in ("keyDown", "keyUp"):
                try:
                    sess.call("Input.dispatchKeyEvent", {
                        "type": kind, "key": name, "code": name, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
                    }, timeout=3.0)
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(0.06)
            time.sleep(pause)
    finally:
        if own:
            sess.close()


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


def shelf_count(host: str, port: int) -> int:
    r = nav._bp_eval(host, port, "document.querySelectorAll('.ds-shelf[data-shelfid]').length")
    return int(r or 0)


def home(sjc: Session, host: str, port: int) -> None:
    nav.ensure_bp_clean(sjc, host, port)


def open_qam(sjc: Session) -> None:
    nav.open_qam(sjc)


def close_qam(sjc: Session) -> None:
    nav.close_qam(sjc)


def navigate(sjc: Session, route: str, settle: float = 2.0) -> None:
    nav.navigate(sjc, route, settle_ms=int(settle * 1000))


def run_in_plugin(sjc: Session, expr: str):
    """Evaluate in the SharedJSContext realm (plugin globals, dev hooks)."""
    try:
        return sjc.evaluate(expr)
    except Exception:  # noqa: BLE001
        return None
