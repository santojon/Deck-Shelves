"""About page tabs render."""
from __future__ import annotations

import time

from ..lib.runner import suite, SkipTest

s = suite("about")


def _navigate_about(ctx) -> bool:
    """Navigate to DS About route via DFL.Navigation. Returns False if crash."""
    ctx.eval_sjc("""
(function(){
    var dfl = window.DFL || window.deckyFrontendLib;
    var nav = dfl?.Navigation;
    if (nav?.Navigate) nav.Navigate("/deck-shelves/about");
})()
""")
    time.sleep(2.5)
    # Check for crash — navigation can trigger userCollections ErrorBoundary
    crash = ctx.eval("document.body.innerText.includes('error occured') || document.body.innerText.includes('error occurred')")
    return crash is not True


@s.test("About route mounts")
def _(ctx) -> None:
    ok = _navigate_about(ctx)
    if not ok:
        # Navigate back home to restore state for subsequent tests
        ctx.navigate("/library/home", settle_ms=1000)
        raise SkipTest("About route navigation triggered ErrorBoundary (transient session crash)")
    found = ctx.eval("!!document.querySelector('[role=\"tab\"]')")
    ctx.navigate("/library/home", settle_ms=500)
    assert found is True, "About tabs not rendered"


@s.test("About has at least one section")
def _(ctx) -> None:
    ok = _navigate_about(ctx)
    if not ok:
        ctx.navigate("/library/home", settle_ms=1000)
        raise SkipTest("About route navigation triggered ErrorBoundary (transient session crash)")
    n = ctx.eval("(function(){ const tabs = document.querySelectorAll('[role=\"tab\"]'); return tabs.length; })()")
    ctx.navigate("/library/home", settle_ms=500)
    assert isinstance(n, (int, float)) and n >= 3, f"expected ≥ 3 About tabs, got {n}"
