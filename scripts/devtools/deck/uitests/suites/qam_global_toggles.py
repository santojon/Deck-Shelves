"""QAM Apply globally / Visual global section."""
from __future__ import annotations

from ..lib.runner import suite, SkipTest
from .qam_shelves import _require_qam

s = suite("qam_global_toggles")


@s.test("Apply globally / Visual section header present")
def _(ctx) -> None:
    _require_qam(ctx)
    found = ctx.eval(
        "(function(){ return Array.from(document.querySelectorAll('button, h3, div')).some(e => /global|visual|apply/i.test(e.textContent||'')); })()"
    )
    ctx.close_qam()
    assert found is True, "global/visual section header not found"
