"""Script 8 — power-user tools: the full-page Settings and its Advanced area."""
from __future__ import annotations

from deckprobe.video.lib.registry import Context, register
from deckprobe.video.lib import steps as s


@register("08_power_tools")
def power_tools(ctx: Context) -> None:
    """There's a hidden panel full of tools — Settings, Advanced, Performance."""
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.5)
    ctx.cue("open the Quick Access menu")
    s.open_qam(ctx.sjc)
    s.wait(2.5)
    s.close_qam(ctx.sjc)
    s.wait(0.8)
    ctx.cue("gear icon → full-page Settings")
    s.navigate(ctx.sjc, "/deck-shelves/settings", settle=2.5)
    s.wait(3.0)
    ctx.cue("tabs: Shelves, Profiles, Shortcuts, Backup, Suggestions, Statistics")
    s.press(ctx.host, ctx.port, "down", times=3, pause=0.9)
    s.wait(1.5)
    ctx.cue("Advanced: snapshots, caches, diagnostics, performance")
    s.press(ctx.host, ctx.port, "down", times=3, pause=0.9)
    s.wait(3.0)
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.0)
