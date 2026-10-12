"""Scripts 6 and 7 — profiles + triggers, online shelves (wishlist / store)."""
from __future__ import annotations

from deckprobe.video.lib.registry import Context, register
from deckprobe.video.lib import steps as s


@register("06_profiles_triggers")
def profiles_triggers(ctx: Context) -> None:
    """Your home changes itself — the Profiles panel, then the docked profile's trigger."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    ctx.cue("home, handheld profile")
    s.wait(1.5)
    s.navigate(ctx.sjc, "/deck-shelves/settings", settle=2.5)
    ctx.cue("Settings → Profiles")
    s.wait(4.0)
    ctx.cue("the docked profile switches on charging")
    s.wait(2.0)
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.5)


@register("07_online")
def online(ctx: Context) -> None:
    """Plan your next buy from the home screen — wishlist and store shelves."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(2.0)
    n = s.shelf_count(ctx.host, ctx.port)
    target = max(0, n - 1)
    s.scroll_to_shelf(ctx.host, ctx.port, target)
    s.wait(1.5)
    s.focus_first_card(ctx.host, ctx.port, target)
    ctx.cue("online shelf: discounts and wishlist")
    s.wait(2.0)
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.6)
    s.wait(1.5)
    ctx.cue("opt in, browse, plan")
    s.wait(1.5)
