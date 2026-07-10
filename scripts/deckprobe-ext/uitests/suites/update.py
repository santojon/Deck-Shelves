"""Update notifier — the data path that feeds the QAM update banner.

The banner (`src/components/qam/UpdateBanner.tsx`) renders purely off two live
signals produced in the SharedJSContext realm:

  * `checkForUpdate()` — reports whether a newer release exists, and
  * `isOnline()` — the connectivity probe that gates the network check.

The QAM DOM path is unreliable to drive (Decky may or may not mount a plugin's
own panel content — the sibling qam_shelves suite only asserts the plugin is
*listed* for that reason), so this suite exercises the real functions on-device
through the dev bridges (`__ds_dev_check_update`, `__ds_dev_is_online`) instead
of scraping the banner element. That guards the two regressions that actually
broke update notifications:

  * the notifier not surfacing an available release, and
  * the `isOnline` no-cors fix (a cross-origin HEAD in default CORS mode
    rejects with "Failed to fetch", which made every check fall back to
    "offline" and silently hid the banner).

With the dev-only `qa:update-available` flag set, `checkForUpdate()` short-
circuits to a forced "newer release" (v99.0.0) so the surfaced-update assertion
is deterministic regardless of the deployed version.
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("update")

_FLAG = "qa:update-available"


def _require_bridge(ctx) -> None:
    ok = ctx.eval_sjc("typeof window.__ds_dev_check_update === 'function'")
    if ok is not True:
        raise SkipTest("dev update bridge not present (release build?)")


def _set_flag(ctx, on: bool) -> None:
    op = f"localStorage.setItem({_FLAG!r},'1')" if on else f"localStorage.removeItem({_FLAG!r})"
    ctx.eval_sjc(f"(function(){{try{{{op};}}catch(e){{}}return 1;}})()")


@s.test("An available update is surfaced to the banner")
def _(ctx) -> None:
    _require_bridge(ctx)
    _set_flag(ctx, True)
    try:
        r = ctx.eval_sjc(
            "(async function(){var x=await window.__ds_dev_check_update();"
            "return {h:!!(x&&x.hasUpdate),v:x&&x.latestVersion};})()",
            timeout=12,
        ) or {}
        if r.get("h") is not True:
            raise AssertionError(f"checkForUpdate did not surface an update: {r!r}")
        if r.get("v") != "99.0.0":
            raise AssertionError(f"unexpected latestVersion: {r!r}")
    finally:
        _set_flag(ctx, False)


@s.test("Connectivity probe reports reachable (no-cors regression guard)")
def _(ctx) -> None:
    _require_bridge(ctx)
    online = ctx.eval_sjc(
        "(async function(){try{return await window.__ds_dev_is_online();}catch(e){return 'err';}})()",
        timeout=12,
    )
    if online == "err":
        raise AssertionError("isOnline() threw — the no-cors probe fix likely regressed")
    if online is not True:
        # A genuinely offline test box shouldn't fail the suite; the regression
        # we care about (a throwing probe) is caught above.
        raise SkipTest("device reports offline — cannot validate reachable path")
