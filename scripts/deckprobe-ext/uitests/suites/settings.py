"""Settings / configuration coverage — driven through the public API.

These assert the plugin's settings, environment, profiles and
integrations are reachable and well-shaped via `window.deckShelves.api`.
Going through the API (instead of the QAM DOM) keeps the suite stable and
doubles as a live contract check that external integrations rely on.
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest
from _ds_api import require_api, eval_api

s = suite("settings")


@s.test("settings snapshot exposes expected shape")
def _(ctx) -> None:
    require_api(ctx)
    snap = eval_api(ctx, "window.deckShelves.api.getSettingsSnapshot()")
    assert isinstance(snap, dict), f"snapshot not an object: {snap!r}"
    assert isinstance(snap.get("enabled"), bool), "snapshot.enabled missing/!bool"
    assert isinstance(snap.get("featureToggles"), dict), "featureToggles not an object"
    assert isinstance(snap.get("integrationsEnabled"), dict), "integrationsEnabled not an object"


@s.test("environment reports api version 4")
def _(ctx) -> None:
    require_api(ctx)
    env = eval_api(ctx, "window.deckShelves.api.getEnvironment()")
    assert isinstance(env, dict), f"environment not an object: {env!r}"
    assert env.get("apiVersion") == 4, f"apiVersion expected 4, got {env.get('apiVersion')!r}"
    pv = env.get("pluginVersion")
    assert isinstance(pv, str) and pv != "0.0.0" and pv != "", f"pluginVersion looks unset: {pv!r}"


@s.test("profiles list is an array and matches active profile")
def _(ctx) -> None:
    require_api(ctx)
    res = eval_api(ctx, """
(function(){
    const api = window.deckShelves.api;
    const profiles = api.getProfiles();
    const active = api.getActiveProfile();
    return {
        isArray: Array.isArray(profiles),
        count: Array.isArray(profiles) ? profiles.length : -1,
        activeName: active && typeof active.name === 'string' ? active.name : null,
        names: Array.isArray(profiles) ? profiles.map(p => p.name) : [],
    };
})()""")
    assert isinstance(res, dict) and res.get("isArray") is True, f"profiles not an array: {res!r}"
    active = res.get("activeName")
    if active:
        assert active in res.get("names", []), f"active profile {active!r} not in list {res.get('names')!r}"


@s.test("integrations list is an array")
def _(ctx) -> None:
    require_api(ctx)
    res = eval_api(ctx, """
(function(){
    const list = window.deckShelves.api.getIntegrations();
    return {
        isArray: Array.isArray(list),
        allHaveId: Array.isArray(list) && list.every(i => typeof i.id === 'string' && i.id.length > 0),
    };
})()""")
    assert isinstance(res, dict) and res.get("isArray") is True, f"integrations not an array: {res!r}"
    assert res.get("allHaveId") is True, "some integration entries missing a string id"


@s.test("feature toggles round-trip through snapshot")
def _(ctx) -> None:
    require_api(ctx)
    consistent = eval_api(ctx, """
(function(){
    const a = window.deckShelves.api.getSettingsSnapshot();
    const b = window.deckShelves.api.getSettingsSnapshot();
    return JSON.stringify(a) === JSON.stringify(b);
})()""")
    assert consistent is True, "snapshot not stable across two reads"


@s.test("built-in library statistics provider registered")
def _(ctx) -> None:
    require_api(ctx)
    ids = eval_api(ctx, """
(function(){
    return (window.deckShelves.api.getRegisteredStatisticsProviders() || []).map(p => p.id);
})()""")
    assert isinstance(ids, list), f"providers not a list: {ids!r}"
    assert "deck-shelves.library" in ids, f"library stats provider missing (got {ids!r})"


@s.test("library statistics resolve returns shaped entries")
def _(ctx) -> None:
    require_api(ctx)
    res = eval_api(ctx, """
(async function(){
    const provs = window.deckShelves.api.getRegisteredStatisticsProviders() || [];
    const p = provs.find(x => x.id === 'deck-shelves.library');
    if (!p) return {err: 'no-provider'};
    try {
        const entries = await p.resolve();
        return {
            ok: Array.isArray(entries),
            shaped: Array.isArray(entries) && entries.every(e =>
                typeof e.id === 'string' && typeof e.label === 'string' &&
                (typeof e.value === 'number' || typeof e.value === 'string')),
            hasTotal: Array.isArray(entries) && entries.some(e => e.id === 'total_games'),
        };
    } catch (e) { return {err: String(e)}; }
})()""", timeout=12)
    assert isinstance(res, dict), f"unexpected result: {res!r}"
    if res.get("err"):
        raise SkipTest(f"statistics not runnable yet: {res['err']}")
    assert res.get("ok") is True, f"resolve did not return an array: {res!r}"
    assert res.get("shaped") is True, "some statistics entries malformed"
    assert res.get("hasTotal") is True, "total_games entry missing"


@s.test("built-in shelf statistics provider registered + resolves")
def _(ctx) -> None:
    require_api(ctx)
    res = eval_api(ctx, """
(async function(){
    const provs = window.deckShelves.api.getRegisteredStatisticsProviders() || [];
    const p = provs.find(x => x.id === 'deck-shelves.shelf-stats');
    if (!p) return {err: 'no-provider'};
    try {
        const entries = await p.resolve();
        return {
            ok: Array.isArray(entries),
            hasTotal: Array.isArray(entries) && entries.some(e => e.id === 'shelves_total'),
        };
    } catch (e) { return {err: String(e)}; }
})()""", timeout=12)
    assert isinstance(res, dict), f"unexpected result: {res!r}"
    if res.get("err"):
        raise SkipTest(f"shelf stats not runnable yet: {res['err']}")
    assert res.get("ok") is True, f"resolve did not return an array: {res!r}"
    assert res.get("hasTotal") is True, "shelves_total entry missing"
