"""EditShelfModal interaction — the shelf editor opened via
`dispatchShelfModal`'s dedicated route (`/deck-shelves/edit/:shelfId`),
independent of the QAM chrome or any gamepad-driven reveal.

Covers structural mount, tab switching, and closing — using plain DOM
`.click()`, which Decky's Focusable/DialogButton support (mouse is "a
bonus" alongside gamepad-first, per the project's own design principles).
Assertions are locale-independent (structural — tab count, content-length
deltas — never rendered text) since the device may run any of 19 locales.
Note: neither a route change nor a synthetic Escape keydown unmounts this
modal (verified live) — it's a DFL overlay, not tied to the router, and
whatever it listens on for cancel isn't a plain document keydown. Only the
footer's Cancel button (found via its Primary/Save sibling, not by text)
reliably closes it.

What this suite deliberately does NOT attempt: changing a dropdown's
selected value (Decky's DropdownItem opens a floating popup whose click
target isn't verified reliably here) or a full save round-trip. Those need
either a verified popup-interaction pattern or physical testing — see
project_gamepad_nav_focus_invariants in memory for the established caution
around gamepad-driven flows this harness can't simulate.
"""
from __future__ import annotations

import time

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("edit_shelf_modal")

_MODAL_SEL = "[class*=GenericConfirmDialog]"


def _read_settings(ctx) -> dict:
    return ctx.eval("""
(function(){
    try {
        const raw = localStorage.getItem('deck-shelves-settings-cache-v3')
                 || JSON.stringify(window.__DECK_SHELVES_SHARED_SETTINGS__ || {});
        return JSON.parse(raw || '{}');
    } catch { return {}; }
})()
""") or {}


def _first_shelf_id(ctx) -> str | None:
    shelves = _read_settings(ctx).get("shelves") or []
    return shelves[0]["id"] if shelves else None


def _sweep_stray_modals(ctx) -> None:
    # A modal left mounted by an earlier test (this suite or another one in
    # the same run) would otherwise sit in front of / behind the one this
    # test opens, and an unscoped querySelector could silently grab the
    # wrong instance. Cheap insurance: close whatever's already there before
    # navigating to a fresh one.
    ctx.eval(f"""
(function(){{
    for (let i = 0; i < 5; i++) {{
        const modal = document.querySelector({_MODAL_SEL!r});
        if (!modal) break;
        const saveBtn = modal.querySelector('[class*=Primary]');
        const cancelBtn = saveBtn ? saveBtn.nextElementSibling : null;
        if (!cancelBtn) break;
        cancelBtn.click();
    }}
    return true;
}})()
""")


def _navigate_to_edit(ctx, shelf_id: str) -> None:
    # Same path core/shelfActions.ts's dispatchShelfModal takes internally —
    # DFL/window Navigation.Navigate to the dedicated edit route. Bypasses
    # deckprobe's shared nav.navigate() (tuned for tab-level navigation, not
    # this project's custom modal routes).
    _sweep_stray_modals(ctx)
    ctx.eval_sjc(f"""
(function(){{
    const nav = (globalThis).DFL?.Navigation ?? (globalThis).Navigation ?? (globalThis).window?.Navigation;
    if (typeof nav?.Navigate !== 'function') return 'no-nav-api';
    nav.Navigate('/deck-shelves/edit/{shelf_id}');
    return 'navigated';
}})()
""")
    time.sleep(1.5)


def _modal_present(ctx) -> bool:
    return ctx.eval(f"!!document.querySelector({_MODAL_SEL!r})") is True


def _close_modal(ctx) -> None:
    # The modal is a DFL overlay, not route-bound — changing the underlying
    # route does NOT unmount it, and a synthetic Escape keydown doesn't
    # reach whatever DFL actually listens on for cancel (verified live:
    # neither closes it). The footer's Cancel button does. It has no
    # locale-independent text, but it's always the DialogButton immediately
    # after the Primary (Save) one, which IS reliably selectable.
    ctx.eval(f"""
(function(){{
    const modal = document.querySelector({_MODAL_SEL!r});
    if (!modal) return false;
    const saveBtn = modal.querySelector('[class*=Primary]');
    const cancelBtn = saveBtn ? saveBtn.nextElementSibling : null;
    if (cancelBtn) {{ cancelBtn.click(); return true; }}
    return false;
}})()
""")
    time.sleep(1.0)


@s.test("EditShelfModal mounts via direct route navigation")
def _(ctx) -> None:
    shelf_id = _first_shelf_id(ctx)
    if not shelf_id:
        raise SkipTest("no shelves configured")
    _navigate_to_edit(ctx, shelf_id)
    try:
        result = ctx.eval(f"""
(function(){{
    const modal = document.querySelector({_MODAL_SEL!r});
    if (!modal) return null;
    return {{
        tabCount: modal.querySelectorAll('[role=tab]').length,
        hasLimitSlider: !!modal.querySelector('input[type=range], [class*=Slider]'),
        hasSourceDropdown: !!modal.querySelector('[class*=DropDown]'),
    }};
}})()
""")
        assert result is not None, "EditShelfModal did not mount after navigating to its edit route"
        assert result["tabCount"] == 5, f"expected 5 tabs (source/filters/visual/decoration/display), got {result['tabCount']}"
        assert result["hasLimitSlider"] is True, "limit slider not found on the source tab"
        assert result["hasSourceDropdown"] is True, "source-type dropdown not found on the source tab"
    finally:
        _close_modal(ctx)


@s.test("switching tabs changes the visible panel content")
def _(ctx) -> None:
    shelf_id = _first_shelf_id(ctx)
    if not shelf_id:
        raise SkipTest("no shelves configured")
    _navigate_to_edit(ctx, shelf_id)
    try:
        if not _modal_present(ctx):
            raise SkipTest("EditShelfModal did not mount")
        before = ctx.eval(f"document.querySelector({_MODAL_SEL!r}).innerText.length")
        clicked = ctx.eval(f"""
(function(){{
    const modal = document.querySelector({_MODAL_SEL!r});
    const tabs = Array.from(modal.querySelectorAll('[role=tab]'));
    if (tabs.length < 3) return false;
    tabs[2].click();  // Visual tab — always present regardless of source/filter shape
    return true;
}})()
""")
        assert clicked is True, "could not click the third tab"
        time.sleep(0.6)
        if not _modal_present(ctx):
            raise SkipTest("modal closed unexpectedly after a tab click")
        after = ctx.eval(f"document.querySelector({_MODAL_SEL!r}).innerText.length")
        assert after != before, "panel content length unchanged after switching tabs"
    finally:
        _close_modal(ctx)


@s.test("Cancel closes the modal")
def _(ctx) -> None:
    shelf_id = _first_shelf_id(ctx)
    if not shelf_id:
        raise SkipTest("no shelves configured")
    _navigate_to_edit(ctx, shelf_id)
    if not _modal_present(ctx):
        raise SkipTest("EditShelfModal did not mount")
    _close_modal(ctx)
    assert _modal_present(ctx) is False, "modal still present after clicking Cancel"
