"""QAM Apply globally / Visual global section."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("qam_global_toggles")


@s.test("Apply globally / Visual section header present")
def _(ctx) -> None:
    ctx.open_qam(settle_ms=1500)
    found = ctx.eval(
        "(function(){ return Array.from(document.querySelectorAll('button, h3, div')).some(e => /global|visual|apply/i.test(e.textContent||'')); })()"
    )
    ctx.close_qam()
    assert found is True, "global/visual section header not found"
