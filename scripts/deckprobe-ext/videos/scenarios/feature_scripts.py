"""Feature-script video scenarios — nine timed sequences: one per content
script (custom shelves, smart shelves, filters, visual customization, Quick
Search + Side Nav, profiles + triggers, online shelves, power-user tools)
plus the Quick Access menu's quick-settings sidecar. Requires the video
fixture deployed first (`pnpm run qa:video-fixture`): the `vid_*` shelves and
profiles referenced here only exist under that fixture, and the overlays'
openers are dev-build hooks.

Each scenario drives the live window through `_steps` while the runner's
screencast records it, and prints cue points with timestamps for a voice-over
or cut list (also written beside the mp4). Every step is best-effort: a
missed one is logged in the cues and the sequence goes on."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib import nav
from deckprobe.videos.lib.registry import register
from . import _steps as s
from ._steps import Context

# Dev-build hooks the overlays publish (the same ones the UI tests use).
OPEN_SEARCH = "(() => { try { window.__ds_dev_open_search(%s); return true; } catch (e) { return false; } })()"
CLOSE_SEARCH = "(() => { try { window.__ds_dev_close_search(); return true; } catch (e) { return false; } })()"
OPEN_SIDENAV = "(() => { try { window.__ds_dev_open_sidenav(); return true; } catch (e) { return false; } })()"
CLOSE_SIDENAV = "(() => { try { window.__ds_dev_close_sidenav(); return true; } catch (e) { return false; } })()"
OPEN_SIDECAR = "(() => { try { return !!(window.__ds_dev_open_sidecar && window.__ds_dev_open_sidecar()); } catch (e) { return false; } })()"
CLOSE_SIDECAR = "(() => { try { window.__ds_dev_close_sidecar && window.__ds_dev_close_sidecar(); return true; } catch (e) { return false; } })()"


def _prepare(ctx: Context) -> None:
    """Runs before the recording starts: locale, a settled Home, controller glyphs."""
    if not s.prepare_home(ctx.sjc, ctx.host, ctx.port):
        ctx.cue("home did not settle before recording")


def _open_editor(ctx: Context, shelf_id: str, tab: str = "") -> bool:
    """Open a fixture shelf's editor, on the tab whose label contains `tab`."""
    s.navigate(ctx.sjc, f"/deck-shelves/edit/{shelf_id}", settle=2.5)
    if not s.await_modal(ctx.host, ctx.port):
        ctx.cue("editor did not open")
        return False
    if tab:
        s.wait(0.8)
        if not s.click_modal_tab(ctx.host, ctx.port, tab):
            ctx.cue(f"tab '{tab}' not found")
    return True


def _custom_shelves(ctx: Context) -> None:
    ctx.cue("home with shelves")
    s.wait(2.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_favorites")
    s.wait(0.8)
    ctx.cue("walk the first shelf")
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.55)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "down", times=1)
    s.wait(1.2)
    ctx.cue("second shelf")
    s.press(ctx.host, ctx.port, "right", times=3, pause=0.55)
    s.wait(1.0)
    ctx.cue("the shelf editor: source, sort, limit")
    if _open_editor(ctx, "vid_favorites"):
        s.wait(4.0)
        s.dismiss_modal(ctx.host, ctx.port)
    ctx.cue("back home")
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.5)


@register("01_custom_shelves")
def custom_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Your Steam Deck home, your rules — show the shelves, walk a row, open the editor."""
    return s.run("01_custom_shelves", sjc, host, port, out_dir, _custom_shelves, setup=_prepare)


def _smart_shelves(ctx: Context) -> None:
    s.wait(1.0)
    n = s.shelf_count(ctx.host, ctx.port)
    ctx.cue(f"{n} shelves on the home")
    s.await_shelf_cards(ctx.host, ctx.port, "vid_sm_quick", timeout=8.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_sm_quick")
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
    return s.run("02_smart_shelves", sjc, host, port, out_dir, _smart_shelves, setup=_prepare)


def _filters(ctx: Context) -> None:
    s.wait(1.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_acclaimed")
    ctx.cue("filtered shelf: installed + played, by playtime")
    s.wait(2.0)
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.55)
    s.wait(1.0)
    ctx.cue("its editor, Filters tab: two stacked conditions")
    if _open_editor(ctx, "vid_acclaimed", tab="filter"):
        s.wait(4.5)
        s.dismiss_modal(ctx.host, ctx.port)
    ctx.cue("back home")
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.0)


@register("03_filters")
def filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Only the games you want — a stacked-filter shelf, then its editor."""
    return s.run("03_filters", sjc, host, port, out_dir, _filters, setup=_prepare)


def _visual(ctx: Context) -> None:
    s.wait(1.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_now_playing")
    ctx.cue("featured first card + hero art")
    s.wait(2.5)
    s.press(ctx.host, ctx.port, "right", times=2, pause=0.8)
    s.wait(1.0)
    s.press(ctx.host, ctx.port, "right", times=2, pause=0.8)
    ctx.cue("hero follows the focused game")
    s.wait(2.5)
    s.press(ctx.host, ctx.port, "left", times=4, pause=0.4)
    s.wait(1.0)
    ctx.cue("the Visual tab: highlight, hero, labels")
    if _open_editor(ctx, "vid_now_playing", tab="visual"):
        s.wait(4.0)
        s.dismiss_modal(ctx.host, ctx.port)
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.0)


@register("04_visual")
def visual(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Make it look like a store page — hero art, featured first card, labels."""
    return s.run("04_visual", sjc, host, port, out_dir, _visual, setup=_prepare)


def _search_sidenav(ctx: Context) -> None:
    s.wait(1.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_favorites")
    s.wait(1.0)
    ctx.cue("L1+R1: Quick Search")
    # The overlay normally opens from the controller combo; the dev build also
    # exposes an opener so a script can show it, seeded with a query that
    # matches a game on this device, without input emulation.
    # A query for a card further along the shelf: the pill opens with the
    # on-screen keyboard, the match is revealed and focused, the pill closes.
    query = s.card_query(ctx.sjc, ctx.host, ctx.port, index=4)
    s.run_in_plugin(ctx.sjc, OPEN_SEARCH % json.dumps(query))
    s.wait(3.5)
    ctx.cue(f"typed '{query}': the matching card is focused")
    s.run_in_plugin(ctx.sjc, CLOSE_SEARCH)
    s.wait(2.0)
    ctx.cue("L1 twice: Side Nav")
    s.run_in_plugin(ctx.sjc, OPEN_SIDENAV)
    s.wait(2.5)
    if s.overlay_open(ctx.host, ctx.port, ".ds-sidenav-overlay"):
        s.press(ctx.host, ctx.port, "down", times=2, pause=0.7)
        s.wait(1.0)
        s.press(ctx.host, ctx.port, "enter", times=1)
        s.wait(2.0)
        ctx.cue("landed on the chosen shelf")
    else:
        ctx.cue("side nav did not open")
    s.run_in_plugin(ctx.sjc, CLOSE_SIDENAV)
    s.wait(1.5)


@register("05_search_sidenav")
def search_sidenav(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Find any game without scrolling — Quick Search, then the Side Nav."""
    return s.run("05_search_sidenav", sjc, host, port, out_dir, _search_sidenav, setup=_prepare)


def _profiles_triggers(ctx: Context) -> None:
    s.wait(1.0)
    ctx.cue("home, handheld")
    s.wait(1.5)
    s.navigate(ctx.sjc, "/deck-shelves/settings", settle=2.5)
    s.click_tab(ctx.host, ctx.port, "profiles")
    ctx.cue("Settings → Profiles")
    s.wait(3.0)
    if s.open_profile_trigger(ctx.host, ctx.port, "Docked"):
        ctx.cue("the Docked profile's trigger: while charging")
        s.wait(4.0)
        s.dismiss_modal(ctx.host, ctx.port)
    else:
        ctx.cue("trigger editor not opened")
        s.wait(2.0)
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.5)


@register("06_profiles_triggers")
def profiles_triggers(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Your home changes itself — the Profiles panel, then the docked profile's trigger."""
    return s.run("06_profiles_triggers", sjc, host, port, out_dir, _profiles_triggers, setup=_prepare)


def _online(ctx: Context) -> None:
    s.wait(1.0)
    s.await_shelf_cards(ctx.host, ctx.port, "vid_wishlist", timeout=15.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_wishlist")
    ctx.cue("Wishlist shelf: prices and discounts on the home")
    s.wait(2.0)
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.6)
    s.wait(1.0)
    s.await_shelf_cards(ctx.host, ctx.port, "vid_on_sale", timeout=10.0)
    s.focus_shelf(ctx.host, ctx.port, "vid_on_sale")
    ctx.cue("On sale now: the store's deals")
    s.wait(1.5)
    s.press(ctx.host, ctx.port, "right", times=4, pause=0.6)
    s.wait(1.5)
    ctx.cue("opt in, browse, plan")
    s.wait(1.0)


@register("07_online")
def online(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Plan your next buy from the home screen — wishlist and store shelves."""
    return s.run("07_online", sjc, host, port, out_dir, _online, setup=_prepare)


def _power_tools(ctx: Context) -> None:
    s.wait(1.0)
    ctx.cue("gear icon → full-page Settings")
    s.navigate(ctx.sjc, "/deck-shelves/settings", settle=2.5)
    s.wait(2.5)
    for tab in ("profiles", "shortcuts", "backup", "suggestions", "statistics"):
        s.click_tab(ctx.host, ctx.port, tab)
        ctx.cue(f"tab: {tab}")
        s.wait(2.2)
    s.click_tab(ctx.host, ctx.port, "advanced")
    ctx.cue("Advanced tools: snapshots, caches, diagnostics, performance")
    s.wait(3.5)
    s.press(ctx.host, ctx.port, "down", times=3, pause=0.9)
    s.wait(2.0)
    s.home(ctx.sjc, ctx.host, ctx.port)
    s.wait(1.0)


@register("08_power_tools")
def power_tools(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """There's a hidden panel full of tools — Settings, its tabs, Advanced."""
    return s.run("08_power_tools", sjc, host, port, out_dir, _power_tools, setup=_prepare)


def _sidecar(ctx: Context) -> None:
    ctx.cue("Quick Access menu, plugin tab")
    nav.navigate_to_ds_qam(ctx.sjc, ctx.host, ctx.port)
    nav.expand_qam_sections(ctx.host, ctx.port)
    s.wait(2.5)
    ctx.cue("dpad-right: the quick-settings sidecar")
    opened = s.run_in_plugin(ctx.sjc, OPEN_SIDECAR)
    s.wait(4.5 if opened is True else 1.5)
    s.run_in_plugin(ctx.sjc, CLOSE_SIDECAR)
    s.wait(1.2)
    nav.close_qam(ctx.sjc)
    ctx.cue("closed")


@register("09_sidecar")
def sidecar(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """The Quick Access menu's quick-settings sidecar — recorded from the menu's own window."""
    return s.run("09_sidecar", sjc, host, port, out_dir, _sidecar, target="QuickAccess", setup=lambda ctx: s.force_locale(ctx.sjc))
