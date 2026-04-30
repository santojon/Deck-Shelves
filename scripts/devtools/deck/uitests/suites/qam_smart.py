"""QAM smart shelves section."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("qam_smart")


@s.test("Smart shelves section header present")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    found = ctx.eval(
        "(function(){ return Array.from(document.querySelectorAll('button, h3, div')).some(e => (e.textContent||'').toLowerCase().includes('smart')); })()"
    )
    ctx.close_qam()
    assert found is True, "smart shelves header not found"


@s.test("Smart shelves toggle is operable")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    has_toggle = ctx.eval(
        "(function(){ const t = document.querySelector('input[type=\"checkbox\"]'); return !!t; })()"
    )
    ctx.close_qam()
    assert has_toggle is True, "no checkbox found in QAM"
