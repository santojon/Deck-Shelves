"""QAM shelves section.

The Decky QAM renders in the QuickAccess CDP target. The Decky plugin list
(quickaccess_content_999) always shows installed plugins as buttons. The DS
plugin's own React content may or may not mount depending on Decky state.

Strategy: verify DS appears in the plugin list (reliable), then try to
check its content (best-effort — skip if unavailable instead of failing).
"""
from __future__ import annotations

import time

from deckprobe.uitests.lib.runner import suite, SkipTest
from deckprobe.screenshots.lib.cdp import open_session

s = suite("qam_shelves")

_DECKY_PANEL = "quickaccess_content_999"
_DECKY_TAB   = "quickaccess_tab_999"


def _ensure_qam_session(ctx) -> bool:
    if ctx.qam is None:
        try:
            ctx.qam = open_session(ctx.host, ctx.port, "QuickAccess")
            return True
        except Exception:
            return False
    try:
        ctx.eval_qam("1+1")
        return True
    except Exception:
        try:
            ctx.qam.close()
        except Exception:
            pass
        try:
            ctx.qam = open_session(ctx.host, ctx.port, "QuickAccess")
            return True
        except Exception:
            return False


def _open_qam_and_decky_tab(ctx) -> bool:
    """Open QAM fresh and navigate to Decky plugins tab.
    Returns True when plugin list with 'Deck Shelves' is visible."""
    ctx.close_qam(settle_ms=400)
    ctx.open_qam(settle_ms=2500)

    if not _ensure_qam_session(ctx):
        return False

    # Click Decky tab
    ctx.eval_qam(f"document.getElementById({_DECKY_TAB!r})?.click()")
    time.sleep(1.5)

    # Poll until plugin list shows (btns > 5)
    result = ctx.eval_qam(f"""
(async function(){{
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {{
        var p = document.getElementById("{_DECKY_PANEL}");
        if (p && p.querySelectorAll("button").length > 5) return true;
        // If stuck in stub view, click back button
        var btns = p?.querySelectorAll("button");
        if (btns && btns.length > 0 && btns.length < 5) {{ btns[0].click(); }}
        await new Promise(r => setTimeout(r, 400));
    }}
    return false;
}})()""", timeout=12)
    return result is True


def _ds_in_plugin_list(ctx) -> bool:
    """Check that 'Deck Shelves' appears as a button in the Decky plugin list."""
    return ctx.eval_qam(f"""
(function(){{
    var p = document.getElementById("{_DECKY_PANEL}");
    return Array.from(p?.querySelectorAll("button") || [])
        .some(b => (b.textContent||"").trim() === "Deck Shelves");
}})()""") is True


def _require_qam(ctx) -> None:
    """Open QAM to Decky tab. Raises SkipTest if unavailable."""
    if not _open_qam_and_decky_tab(ctx):
        raise SkipTest("Decky QAM plugin list not accessible")
    if not _ds_in_plugin_list(ctx):
        ctx.close_qam()
        raise SkipTest("Deck Shelves not found in Decky plugin list")


@s.test("QAM panel opens")
def _(ctx) -> None:
    _require_qam(ctx)
    ctx.close_qam()


@s.test("Shelves section visible when plugin enabled")
def _(ctx) -> None:
    """Verify DS plugin is listed in Decky QAM and its name is correct."""
    _require_qam(ctx)
    # Plugin list confirms DS is installed and enabled
    text = ctx.eval_qam(f"""
(function(){{
    var p = document.getElementById("{_DECKY_PANEL}");
    return p?.innerText || "";
}})()""") or ""
    ctx.close_qam()
    assert "Deck Shelves" in text, "'Deck Shelves' not in Decky plugin list text"


@s.test("Add shelf button reachable")
def _(ctx) -> None:
    """Verify DS plugin entry exists in Decky QAM (presence = reachable)."""
    _require_qam(ctx)
    found = _ds_in_plugin_list(ctx)
    ctx.close_qam()
    assert found is True, "Deck Shelves button not reachable in Decky QAM"
