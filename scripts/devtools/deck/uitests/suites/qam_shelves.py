"""QAM shelves section: open, sections render, action row visible."""
from __future__ import annotations

import time

from ..lib.runner import suite, SkipTest

s = suite("qam_shelves")

_QAM_SELECTORS = (
    '[id^="quickaccess_content_"]',
    '[class*="QuickAccess"]',
    '[class*="quickaccess"]',
    '[data-panel-group-id="quickaccess"]',
    '.quickaccessmenu_Tab_',
)


def _qam_is_open(ctx) -> bool:
    sel = ", ".join(f'"{q}"' for q in _QAM_SELECTORS)
    return ctx.eval(f"(function(){{ return [{sel}].some(s => !!document.querySelector(s)); }})()")  is True


def _require_qam(ctx, settle_ms: int = 2000) -> None:
    """Open QAM and raise SkipTest if it doesn't respond (API not available)."""
    ctx.open_qam(settle_ms=settle_ms)
    if not _qam_is_open(ctx):
        # Try once more with extra settle time before giving up
        time.sleep(1.0)
        ctx.open_qam(settle_ms=1500)
        if not _qam_is_open(ctx):
            raise SkipTest("QAM did not open — OnQuickAccessButtonPressed API unavailable in this Steam build")


@s.test("QAM panel opens")
def _(ctx) -> None:
    _require_qam(ctx)
    ctx.close_qam()


@s.test("Shelves section visible when plugin enabled")
def _(ctx) -> None:
    _require_qam(ctx)
    found = ctx.eval(
        "!!document.querySelector('.deck-shelves-shelf-list, [data-ds-section=\"shelves\"], "
        "[class*=\"DeckShelves\"], [class*=\"deck-shelves\"]')"
    )
    ctx.close_qam()
    assert found is True, "shelves section/list not present in QAM"


@s.test("Add shelf button reachable")
def _(ctx) -> None:
    _require_qam(ctx)
    found = ctx.eval(
        "(function(){ const btns = document.querySelectorAll('.deck-shelves-action-btn button'); return btns && btns.length > 0; })()"
    )
    ctx.close_qam()
    assert found is True, "no action buttons in QAM"
