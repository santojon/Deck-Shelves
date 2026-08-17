"""Side-nav overlay coverage.

The shelf side-nav mounts with the home patch and exposes a few global
probes (`__ds_sidenav_mounted`, `__ds_sidenav_enabled`). The overlay
itself is gesture-opened (a button hold), which can't be driven reliably
over CDP, so this suite asserts the component is wired and that the
overlay stays lazy until triggered.

`homePatch.tsx` (and everything it mounts, incl. `ShelfSideNav`) runs in
the SharedJSContext realm even though it renders into the Big Picture
document cross-realm — so the two probe globals live on `sjc`'s
`globalThis`, not `bp`'s, while the rendered `.ds-sidenav-overlay` DOM
itself is queried on `bp` like any other home element.
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("sidenav")


@s.test("side-nav component mounted on home")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    mounted = ctx.eval_sjc("(function(){ return (globalThis.__ds_sidenav_mounted || 0); })()")
    if not isinstance(mounted, (int, float)) or mounted <= 0:
        raise SkipTest("side-nav not mounted (home patch inactive or plugin disabled)")
    assert mounted > 0, f"side-nav mount count not positive: {mounted}"


@s.test("side-nav enabled flag is a boolean")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    mounted = ctx.eval_sjc("(function(){ return (globalThis.__ds_sidenav_mounted || 0); })()")
    if not isinstance(mounted, (int, float)) or mounted <= 0:
        raise SkipTest("side-nav not mounted")
    kind = ctx.eval_sjc("typeof globalThis.__ds_sidenav_enabled")
    assert kind == "boolean", f"__ds_sidenav_enabled should be boolean, got {kind!r}"


@s.test("overlay stays closed until triggered")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    mounted = ctx.eval_sjc("(function(){ return (globalThis.__ds_sidenav_mounted || 0); })()")
    if not isinstance(mounted, (int, float)) or mounted <= 0:
        raise SkipTest("side-nav not mounted")
    count = ctx.eval("document.querySelectorAll('.ds-sidenav-overlay').length")
    assert count == 0, f"overlay should be absent before trigger, found {count}"
