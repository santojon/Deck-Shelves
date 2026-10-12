"""Scripts 3 and 4 — filters, visual customization (video fixture shelves)."""
from __future__ import annotations

from deckprobe.video.lib.registry import Context, register
from deckprobe.video.lib import steps as s


@register("03_filters")
def filters(ctx: Context) -> None:
    """Only the games you want — a stacked-filter shelf, then its editor."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    s.scroll_to_shelf(ctx.host, ctx.port, 1)
    s.wait(1.0)
    s.focus_first_card(ctx.host, ctx.port, 1)
    ctx.cue("filtered shelf: installed + played, by playtime")
    s.wait(2.0)
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.55)
    s.wait(1.0)
    ctx.cue("open the editor (Settings → Shelves)")
    s.navigate(ctx.sjc, "/deck-shelves/settings", settle=2.5)
    s.wait(3.5)
    ctx.cue("back home")
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.0)


@register("04_visual")
def visual(ctx: Context) -> None:
    """Make it look like a store page — hero art, featured first card, labels."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    n = s.shelf_count(ctx.host, ctx.port)
    target = min(2, max(0, n - 1))
    s.scroll_to_shelf(ctx.host, ctx.port, target)
    s.wait(1.2)
    s.focus_first_card(ctx.host, ctx.port, target)
    ctx.cue("featured first card + hero art")
    s.wait(2.5)
    s.press(ctx.host, ctx.port, "right", times=2, pause=0.8)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "right", times=2, pause=0.8)
    ctx.cue("hero follows the focused game")
    s.wait(2.5)
    s.press(ctx.host, ctx.port, "left", times=4, pause=0.4)
    s.wait(1.5)
