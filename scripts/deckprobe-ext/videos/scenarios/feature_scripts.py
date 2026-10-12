"""Feature-script video scenarios — eight timed sequences, one per content
script (custom shelves, smart shelves, filters, visual customization, Quick
Search + Side Nav, profiles + triggers, online shelves, power-user tools).
Requires the video fixture deployed first (`pnpm run qa:video-fixture`): the
`vid_*` shelves and profiles referenced here only exist under that fixture.

Each scenario drives the live Big Picture window through `_steps` while the
runner's screencast records it, and prints cue points with timestamps for a
voice-over or cut list (also written beside the mp4)."""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.videos.lib.registry import register
from . import _steps as s
from ._steps import Context

# Dev-build hooks the overlays publish (the same ones the UI tests use).
OPEN_SEARCH = "(() => { try { window.__ds_dev_open_search(); return true; } catch (e) { return false; } })()"
CLOSE_SEARCH = "(() => { try { window.__ds_dev_close_search(); return true; } catch (e) { return false; } })()"
OPEN_SIDENAV = "(() => { try { window.__ds_dev_open_sidenav(); return true; } catch (e) { return false; } })()"


def _custom_shelves(ctx: Context) -> None:
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


@register("01_custom_shelves")
def custom_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Your Steam Deck home, your rules — show the shelves, walk a row, open the editor."""
    return s.run("01_custom_shelves", sjc, host, port, out_dir, _custom_shelves)


def _smart_shelves(ctx: Context) -> None:
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


@register("02_smart_shelves")
def smart_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Shelves that fill themselves — scroll to the smart shelves and let them speak."""
    return s.run("02_smart_shelves", sjc, host, port, out_dir, _smart_shelves)


def _filters(ctx: Context) -> None:
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


@register("03_filters")
def filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Only the games you want — a stacked-filter shelf, then its editor."""
    return s.run("03_filters", sjc, host, port, out_dir, _filters)


def _visual(ctx: Context) -> None:
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


@register("04_visual")
def visual(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Make it look like a store page — hero art, featured first card, labels."""
    return s.run("04_visual", sjc, host, port, out_dir, _visual)


def _search_sidenav(ctx: Context) -> None:
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


@register("05_search_sidenav")
def search_sidenav(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Find any game without scrolling — Quick Search, then the Side Nav."""
    return s.run("05_search_sidenav", sjc, host, port, out_dir, _search_sidenav)


def _profiles_triggers(ctx: Context) -> None:
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


@register("06_profiles_triggers")
def profiles_triggers(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Your home changes itself — the Profiles panel, then the docked profile's trigger."""
    return s.run("06_profiles_triggers", sjc, host, port, out_dir, _profiles_triggers)


def _online(ctx: Context) -> None:
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


@register("07_online")
def online(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Plan your next buy from the home screen — wishlist and store shelves."""
    return s.run("07_online", sjc, host, port, out_dir, _online)


def _power_tools(ctx: Context) -> None:
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


@register("08_power_tools")
def power_tools(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """There's a hidden panel full of tools — Settings, Advanced, Performance."""
    return s.run("08_power_tools", sjc, host, port, out_dir, _power_tools)
