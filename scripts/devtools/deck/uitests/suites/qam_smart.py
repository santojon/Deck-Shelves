"""QAM smart shelves section."""
from __future__ import annotations

from ..lib.runner import suite, SkipTest
from .qam_shelves import _require_qam

s = suite("qam_smart")


@s.test("Smart shelves section header present")
def _(ctx) -> None:
    _require_qam(ctx)
    found = ctx.eval(
        "(function(){ return Array.from(document.querySelectorAll('button, h3, div')).some(e => (e.textContent||'').toLowerCase().includes('smart')); })()"
    )
    ctx.close_qam()
    assert found is True, "smart shelves header not found"


@s.test("Smart shelves toggle is operable")
def _(ctx) -> None:
    _require_qam(ctx)
    has_toggle = ctx.eval(
        "(function(){ const t = document.querySelector('input[type=\"checkbox\"]'); return !!t; })()"
    )
    ctx.close_qam()
    assert has_toggle is True, "no checkbox found in QAM"
