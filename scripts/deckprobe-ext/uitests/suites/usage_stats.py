"""Usage tracking → statistics suite.

Drives the dev-only usage hooks the plugin installs in SharedJSContext
(`window.__ds_dev_*`, present in deploy/dev builds, stripped from release)
to generate usage through the *real* tracking model, then asserts the
statistics summary the UI renders from reflects it: card-launch types,
feature use, shelf views and a multi-day trend window.

Non-destructive: every test snapshots the live `ds_usage_v1` store first
and restores it (resetting the in-memory cache) in a finally, so a real
device keeps its actual stats after the run.

Skips cleanly when the hooks aren't present (release build / plugin not
mounted yet this session).
"""
from __future__ import annotations

import json

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("usage_stats")

CARD_TYPES = ["game", "nonsteam", "store", "wishlist"]
FEATURES = ["search", "sidenav", "sidecar", "refresh", "highlight", "hide"]


def _require_hooks(ctx) -> None:
    present = ctx.eval_sjc("typeof window.__ds_dev_seed_usage === 'function'")
    if present is not True:
        raise SkipTest("usage dev hooks not present (release build or plugin not loaded)")


def _shelf_ids(ctx):
    """Real shelf ids from the live settings, so seeded views map to shelves.
    Falls back to None (the seeder then uses synthetic ids)."""
    ids = ctx.eval_sjc("""
(function(){
    try {
        const s = window.__DECK_SHELVES_SHARED_SETTINGS__
               || JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
        const all = [].concat(s.shelves || [], s.smartShelves || []);
        return all.map(x => x && x.id).filter(Boolean).slice(0, 8);
    } catch { return []; }
})()
""")
    return ids if isinstance(ids, list) and ids else None


def _backup(ctx):
    return ctx.eval_sjc("localStorage.getItem('ds_usage_v1')")


def _restore(ctx, raw) -> None:
    ctx.eval_sjc(f"window.__ds_dev_usage_restore({json.dumps(raw)})")


def _seed(ctx, ids, days=14):
    arg = json.dumps(ids) if ids else "undefined"
    return ctx.eval_sjc(f"window.__ds_dev_seed_usage({arg}, {days})") or {}


@s.test("seeded usage populates the statistics summary")
def _(ctx) -> None:
    _require_hooks(ctx)
    backup = _backup(ctx)
    try:
        summary = _seed(ctx, _shelf_ids(ctx), 14)
        assert summary.get("totalCardLaunches", 0) > 0, "no card launches tracked"
        assert summary.get("totalShelfViews", 0) > 0, "no shelf views tracked"
        assert summary.get("totalFeatureUse", 0) > 0, "no feature use tracked"
        assert summary.get("totalDays", 0) >= 7, f"expected a multi-day window, got {summary.get('totalDays')}"
    finally:
        _restore(ctx, backup)


@s.test("every content card type is tracked")
def _(ctx) -> None:
    _require_hooks(ctx)
    backup = _backup(ctx)
    try:
        launches = _seed(ctx, _shelf_ids(ctx), 14).get("cardLaunches", {})
        missing = [c for c in CARD_TYPES if launches.get(c, 0) <= 0]
        assert not missing, f"card types not tracked: {missing}"
    finally:
        _restore(ctx, backup)


@s.test("feature usage is tracked across the catalogue")
def _(ctx) -> None:
    _require_hooks(ctx)
    backup = _backup(ctx)
    try:
        used = _seed(ctx, _shelf_ids(ctx), 14).get("featureUse", {})
        missing = [f for f in FEATURES if used.get(f, 0) <= 0]
        assert not missing, f"features not tracked: {missing}"
    finally:
        _restore(ctx, backup)


@s.test("real track hooks bump the live store")
def _(ctx) -> None:
    _require_hooks(ctx)
    backup = _backup(ctx)
    try:
        before = ctx.eval_sjc("window.__ds_dev_usage_clear(); JSON.stringify(window.__ds_dev_usage_summary())")
        before = json.loads(before)
        assert before.get("totalCardLaunches", 0) == 0, "clear did not empty the store"
        after = ctx.eval_sjc("""
(function(){
    window.__ds_dev_track_card('store');
    window.__ds_dev_track_feature('search');
    window.__ds_dev_track_shelf('s_uitest');
    return JSON.stringify(window.__ds_dev_usage_summary());
})()
""")
        after = json.loads(after)
        assert after.get("cardLaunches", {}).get("store", 0) == 1, "store launch not tracked"
        assert after.get("featureUse", {}).get("search", 0) == 1, "search feature not tracked"
        assert after.get("shelfViews", {}).get("s_uitest", 0) == 1, "shelf view not tracked"
    finally:
        _restore(ctx, backup)
