"""Home screen render assertions."""
from __future__ import annotations

import time
from ..lib.runner import suite

s = suite("home")


@s.test("renders at least one shelf")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2500)
    found = ctx.eval("!!document.querySelector('.ds-shelf[data-shelfid]')")
    assert found is True, "no .ds-shelf rendered on home"


@s.test("first card has appid attribute")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    appid = ctx.eval("(function(){ const c = document.querySelector('.ds-card[data-appid]'); return c ? c.getAttribute('data-appid') : null; })()")
    assert appid and appid != "", f"first card missing data-appid (got {appid!r})"


@s.test("cards reach native size when matchNativeSize is on")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    width = ctx.eval("(function(){ const c = document.querySelector('.ds-card'); return c ? c.offsetWidth : 0; })()")
    assert isinstance(width, (int, float)) and width >= 100, f"unexpected card width: {width}"
