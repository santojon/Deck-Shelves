"""Scripts 1 and 2 — custom shelves, smart shelves (video fixture: `vid_*` shelves)."""
from __future__ import annotations

from deckprobe.video.lib.registry import Context, register
from deckprobe.video.lib import steps as s


@register("01_custom_shelves")
def custom_shelves(ctx: Context) -> None:
    """Your Steam Deck home, your rules — show the shelves, walk a row, open the editor."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    ctx.cue("home with shelves")
    s.wait(2.5)
    s.focus_first_card(ctx.host, ctx.port, 0)
    s.wait(0.8)
    ctx.cue("walk the first shelf")
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.55)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "down", times=1)
    s.wait(1.2)
    ctx.cue("second shelf")
    s.press(ctx.host, ctx.port, "right", times=3, pause=0.55)
    s.wait(1.0)
    ctx.cue("open the Quick Access menu")
    s.open_qam(ctx.sjc)
    s.wait(3.0)
    ctx.cue("close")
    s.close_qam(ctx.sjc)
    s.wait(1.0)


@register("02_smart_shelves")
def smart_shelves(ctx: Context) -> None:
    """Shelves that fill themselves — scroll to the smart shelves and let them speak."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    n = s.shelf_count(ctx.host, ctx.port)
    ctx.cue(f"{n} shelves on the home")
    target = max(0, n - 2)
    s.scroll_to_shelf(ctx.host, ctx.port, target)
    s.wait(1.5)
    s.focus_first_card(ctx.host, ctx.port, target)
    ctx.cue("Quick Play (smart)")
    s.wait(2.0)
    s.press(ctx.host, ctx.port, "right", times=3, pause=0.6)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "down", times=1)
    s.wait(1.2)
    ctx.cue("Deck Picks (smart)")
    s.press(ctx.host, ctx.port, "right", times=3, pause=0.6)
    s.wait(1.5)
