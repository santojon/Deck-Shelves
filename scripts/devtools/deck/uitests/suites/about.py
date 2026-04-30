"""About page tabs render."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("about")


@s.test("About route mounts")
def _(ctx) -> None:
    ctx.navigate("/deck-shelves/about", settle_ms=2000)
    found = ctx.eval("!!document.querySelector('[role=\"tab\"]')")
    assert found is True, "About tabs not rendered"


@s.test("About has at least one section")
def _(ctx) -> None:
    ctx.navigate("/deck-shelves/about", settle_ms=1500)
    n = ctx.eval("(function(){ const tabs = document.querySelectorAll('[role=\"tab\"]'); return tabs.length; })()")
    assert isinstance(n, (int, float)) and n >= 3, f"expected ≥ 3 About tabs, got {n}"
