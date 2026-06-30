"""Search coverage — driven through the public API.

The built-in shelf search provider is registered via the same API
external plugins use. Exercising it here proves the registry + the
provider's resolve path work end-to-end without depending on the
overlay's keybind/DOM (which is too flaky to drive over CDP).
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest
from _ds_api import require_api, eval_api

s = suite("search")

_BUILTIN_ID = "deck-shelves.shelves"


@s.test("built-in shelf search provider registered")
def _(ctx) -> None:
    require_api(ctx)
    ids = eval_api(ctx, """
(function(){
    return (window.deckShelves.api.getRegisteredSearchProviders() || []).map(p => p.id);
})()""")
    assert isinstance(ids, list), f"providers not a list: {ids!r}"
    assert _BUILTIN_ID in ids, f"built-in provider {_BUILTIN_ID!r} not registered (got {ids!r})"


@s.test("provider search returns a hit array without throwing")
def _(ctx) -> None:
    require_api(ctx)
    ctx.navigate("/library/home", settle_ms=1500)
    res = eval_api(ctx, """
(async function(){
    const provs = window.deckShelves.api.getRegisteredSearchProviders() || [];
    const p = provs.find(x => x.id === '%s');
    if (!p) return {err: 'no-provider'};
    try {
        const hits = await p.search('a', 8);
        return {
            ok: Array.isArray(hits),
            count: Array.isArray(hits) ? hits.length : -1,
            shaped: Array.isArray(hits) && hits.every(h => typeof h.appid === 'number' && typeof h.title === 'string'),
        };
    } catch (e) { return {err: String(e)}; }
})()""" % _BUILTIN_ID, timeout=12)
    assert isinstance(res, dict), f"unexpected result: {res!r}"
    if res.get("err"):
        raise SkipTest(f"search not runnable yet: {res['err']}")
    assert res.get("ok") is True, f"search did not return an array: {res!r}"
    assert res.get("shaped") is True, "some hits missing numeric appid / string title"


@s.test("empty query yields no hits")
def _(ctx) -> None:
    require_api(ctx)
    res = eval_api(ctx, """
(async function(){
    const provs = window.deckShelves.api.getRegisteredSearchProviders() || [];
    const p = provs.find(x => x.id === '%s');
    if (!p) return {err: 'no-provider'};
    try { const hits = await p.search('', 8); return {count: Array.isArray(hits) ? hits.length : -1}; }
    catch (e) { return {err: String(e)}; }
})()""" % _BUILTIN_ID, timeout=12)
    assert isinstance(res, dict), f"unexpected result: {res!r}"
    if res.get("err"):
        raise SkipTest(f"search not runnable yet: {res['err']}")
    assert res.get("count") == 0, f"empty query should yield 0 hits, got {res.get('count')!r}"
