"""QAM shelves section: open, sections render, action row visible."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("qam_shelves")


@s.test("QAM panel opens")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    found = ctx.eval("!!document.querySelector('[id^=\"quickaccess_content_\"]')")
    ctx.close_qam()
    assert found is True, "QAM did not open"


@s.test("Shelves section visible when plugin enabled")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    found = ctx.eval("!!document.querySelector('.deck-shelves-shelf-list, [data-ds-section=\"shelves\"]')")
    ctx.close_qam()
    assert found is True, "shelves section/list not present in QAM"


@s.test("Add shelf button reachable")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    found = ctx.eval(
        "(function(){ const btns = document.querySelectorAll('.deck-shelves-action-btn button'); return btns && btns.length > 0; })()"
    )
    ctx.close_qam()
    assert found is True, "no action buttons in QAM"
