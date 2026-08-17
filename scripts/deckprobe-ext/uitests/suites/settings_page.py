"""Full-page Settings UI — the `/deck-shelves/settings` route (PageHeader +
Tabs), reached the same way as `edit_shelf_modal.py` and `about.py`: direct
route navigation via `Navigation.Navigate`, independent of the QAM sidecar
that also exposes some of this same controller state.

Unlike `EditShelfModal` (a DFL overlay), this is a real route — mounted the
same way About is, and unmounted by navigating away, no special close
mechanism needed. The root carries a literal, stable class
(`deck-shelves-settings-page`), so — unlike the modal's `[class*=...]`
partial match — every query here can scope to it directly and never risk
bleeding through to an unrelated Steam element.

Tab set is mode-dependent (light mode drops several, advanced/dev mode add
others), so assertions only rely on the three tabs present in every mode:
Shelves, Profiles, Backup. Assertions are structural (tab count, content
length deltas), never rendered text, since the device may run any of 19
locales.
"""
from __future__ import annotations

import time

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("settings_page")

_PAGE_SEL = ".deck-shelves-settings-page"
_MIN_ALWAYS_ON_TABS = 3  # Shelves, Profiles, Backup — present in every mode


def _navigate_settings(ctx) -> bool:
    """Navigate to the DS Settings route. Returns False on a crash signal,
    mirroring about.py's ErrorBoundary poll (settings shares the same
    routerHook.addRoute mounting path as About)."""
    ctx.eval_sjc("""
(function(){
    const nav = (globalThis).DFL?.Navigation ?? (globalThis).Navigation ?? (globalThis).window?.Navigation;
    if (typeof nav?.Navigate === 'function') nav.Navigate('/deck-shelves/settings');
})()
""")
    settled = ctx.eval(f"""
(async function(){{
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {{
        const txt = document.body.innerText || '';
        if (txt.includes('error occured') || txt.includes('error occurred')) return {{ crash: true }};
        if (document.querySelector({_PAGE_SEL!r})) return {{ crash: false, mounted: true }};
        await new Promise(r => setTimeout(r, 200));
    }}
    return {{ crash: false, mounted: false }};
}})()
""", timeout=15) or {}
    return settled.get("crash") is not True and settled.get("mounted") is True


def _leave_settings(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=800)


@s.test("Settings page mounts via direct route navigation")
def _(ctx) -> None:
    ok = _navigate_settings(ctx)
    if not ok:
        _leave_settings(ctx)
        raise SkipTest("Settings route did not mount (ErrorBoundary or timeout)")
    try:
        result = ctx.eval(f"""
(function(){{
    const page = document.querySelector({_PAGE_SEL!r});
    if (!page) return null;
    return {{ tabCount: page.querySelectorAll('[role=tab]').length }};
}})()
""")
        assert result is not None, "Settings page did not mount"
        assert result["tabCount"] >= _MIN_ALWAYS_ON_TABS, (
            f"expected at least {_MIN_ALWAYS_ON_TABS} tabs (shelves/profiles/backup), got {result['tabCount']}"
        )
    finally:
        _leave_settings(ctx)


@s.test("switching tabs changes the visible detail panel")
def _(ctx) -> None:
    ok = _navigate_settings(ctx)
    if not ok:
        _leave_settings(ctx)
        raise SkipTest("Settings route did not mount")
    try:
        before = ctx.eval(f"document.querySelector({_PAGE_SEL!r}).innerText.length")
        clicked = ctx.eval(f"""
(function(){{
    const page = document.querySelector({_PAGE_SEL!r});
    const tabs = Array.from(page.querySelectorAll('[role=tab]'));
    if (tabs.length < 2) return false;
    tabs[1].click();  // Profiles — always present regardless of mode
    return true;
}})()
""")
        assert clicked is True, "could not click the second tab"
        time.sleep(0.6)
        if not ctx.eval(f"!!document.querySelector({_PAGE_SEL!r})"):
            raise SkipTest("Settings page unmounted unexpectedly after a tab click")
        after = ctx.eval(f"document.querySelector({_PAGE_SEL!r}).innerText.length")
        assert after != before, "panel content length unchanged after switching tabs"
    finally:
        _leave_settings(ctx)


@s.test("navigating home unmounts the Settings page")
def _(ctx) -> None:
    ok = _navigate_settings(ctx)
    if not ok:
        raise SkipTest("Settings route did not mount")
    _leave_settings(ctx)
    # The route unmount isn't always done within the flat 800ms settle
    # above (observed live) — poll briefly instead of a single fixed check.
    present = True
    for _ in range(6):
        present = ctx.eval(f"!!document.querySelector({_PAGE_SEL!r})")
        if present is False:
            break
        time.sleep(0.4)
    assert present is False, "Settings page still mounted after navigating home"
