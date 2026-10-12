"""Script 5 — Quick Search + Side Nav (opened through the plugin's own entry points)."""
from __future__ import annotations

from deckprobe.video.lib.registry import Context, register
from deckprobe.video.lib import steps as s

# Dev-build hooks the overlays publish (the same ones the UI tests use).
OPEN_SEARCH = "(() => { try { window.__ds_dev_open_search(); return true; } catch (e) { return false; } })()"
CLOSE_SEARCH = "(() => { try { window.__ds_dev_close_search(); return true; } catch (e) { return false; } })()"
OPEN_SIDENAV = "(() => { try { window.__ds_dev_open_sidenav(); return true; } catch (e) { return false; } })()"


@register("05_search_sidenav")
def search_sidenav(ctx: Context) -> None:
    """Find any game without scrolling — Quick Search, then the Side Nav."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    s.focus_first_card(ctx.host, ctx.port, 0)
    s.wait(1.0)
    ctx.cue("L1+R1: Quick Search")
    # The overlay normally opens from the controller combo; the dev build also
    # exposes an opener so a script can show it without input emulation.
    s.run_in_plugin(ctx.sjc, OPEN_SEARCH)
    s.wait(3.5)
    s.run_in_plugin(ctx.sjc, CLOSE_SEARCH)
    s.wait(1.2)
    ctx.cue("L1 twice: Side Nav")
    s.run_in_plugin(ctx.sjc, OPEN_SIDENAV)
    s.wait(2.5)
    s.press(ctx.host, ctx.port, "down", times=2, pause=0.7)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "enter", times=1)
    s.wait(2.0)
    ctx.cue("landed on the chosen shelf")
    s.wait(1.5)
