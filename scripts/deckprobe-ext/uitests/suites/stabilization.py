"""Device checks for the 3.4.0 stabilization: Steam-hidden games stay out of tab
and collection shelves (any configuration with such a shelf, e.g. the decoration
fixture of `pnpm run validate:full`; set DS_QA_HIDE_APPID to lend a hidden game)
and the Roulette's refresh card changes the order (smart-shelf QA fixture:
`pnpm run qa:smart-fixture`; it skips without it). Hiding a game on a smart shelf
is a manual check: that fixture rebuilds its smart shelves on every change."""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("stabilization")

_WAIT_SHELVES = """
(async function(){
    const deadline = Date.now() + %d;
    while (Date.now() < deadline) {
        if (document.querySelectorAll('#deck-shelves-home-root .ds-card[data-appid]').length > 0) break;
        await new Promise(r => setTimeout(r, 200));
    }
    return document.querySelectorAll('.ds-shelf[data-shelfid]').length;
})()
"""

# The settings the plugin holds in memory (a QA fixture never reaches the disk).
_SETTINGS_SJC = "JSON.stringify(globalThis.__DECK_SHELVES_SHARED_SETTINGS__ || null)"

_CARDS_OF = """
(function(id){ const shelf = document.querySelector('.ds-shelf[data-shelfid="' + id + '"]');
  if (!shelf) return null;
  return [...shelf.querySelectorAll('.ds-card[data-appid]')].map(c => c.getAttribute('data-appid')); })(%s)
"""


# A shelf below the fold keeps its row unmounted until scrolled near: bring it in and wait for cards.
_REVEAL = """
(async function(id, ms){ const shelf = document.querySelector('.ds-shelf[data-shelfid="' + id + '"]');
  if (!shelf) return null;
  shelf.scrollIntoView({ block: 'center' });
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const n = shelf.querySelectorAll('.ds-card[data-appid]').length;
    if (n > 0) return n;
    await new Promise(r => setTimeout(r, 250));
  }
  return 0; })(%s, %d)
"""


def _reveal(ctx, shelf_id: str, timeout_ms: int = 10000) -> int:
    import json
    return ctx.eval(_REVEAL % (json.dumps(shelf_id), timeout_ms), timeout=timeout_ms / 1000 + 4) or 0


def _home(ctx, timeout_ms: int = 15000) -> int:
    ctx.navigate("/library/home", settle_ms=800)
    return ctx.eval(_WAIT_SHELVES % timeout_ms, timeout=timeout_ms / 1000 + 4) or 0


def _settings(ctx) -> dict:
    import json
    raw = ctx.eval_sjc(_SETTINGS_SJC, timeout=8)
    return json.loads(raw) if raw else {}


_HIDDEN_IDS = """
(function(){ const out = [];
  // The collection store answers at once; the overview's visible_in_game_list lags a game hidden this session.
  for (const id of appStore.m_mapApps.keys()) { try { if (collectionStore.BIsHidden(id)) out.push(String(id)); } catch (e) {} }
  return out; })()
"""


def _set_hidden(ctx, appid: int, hidden: bool) -> None:
    import time
    ctx.eval_sjc(f"collectionStore.SetAppsAsHidden([{appid}], {'true' if hidden else 'false'})", timeout=8)
    # The overview change reaches the shelves through a throttled refresh (about 5 s).
    for _ in range(24):
        time.sleep(0.5)
        now = ctx.eval_sjc(_HIDDEN_IDS, timeout=8) or []
        if (str(appid) in now) == hidden:
            break
    time.sleep(7)


@s.test("tab and collection shelves never show Steam-hidden games")
def _(ctx) -> None:
    import json
    import os
    _home(ctx)
    settings = _settings(ctx)
    shelves = [sh for sh in settings.get("shelves", []) if sh.get("enabled", True) and (sh.get("source") or {}).get("type") in ("tab", "collection")]
    if not shelves:
        raise SkipTest("no tab or collection shelf configured")
    hidden = ctx.eval_sjc(_HIDDEN_IDS, timeout=15) or []
    # A library without hidden games can lend one for the test: DS_QA_HIDE_APPID=<appid>
    # hides that game in Steam for the check and unhides it at the end (Steam keeps the
    # hidden state on the account, so always use a small game and give it back).
    lent = os.environ.get("DS_QA_HIDE_APPID", "").strip()
    lending = bool(lent) and lent not in hidden
    try:
        if not hidden and lending:
            _set_hidden(ctx, int(lent), True)
            _home(ctx)
            hidden = ctx.eval_sjc(_HIDDEN_IDS, timeout=15) or []
        if not hidden:
            raise SkipTest("no Steam-hidden game in this library (set DS_QA_HIDE_APPID to lend one)")
        leaks = {}
        for sh in shelves:
            src = sh.get("source") or {}
            if src.get("type") == "tab" and str(src.get("tab", "")).lower().endswith("hidden"):
                continue
            _reveal(ctx, sh["id"])
            cards = ctx.eval(_CARDS_OF % json.dumps(sh["id"]), timeout=8)
            if not cards:
                continue
            bad = sorted(set(cards) & set(hidden))
            if bad:
                leaks[sh.get("title") or sh["id"]] = bad
    finally:
        if lending:
            _set_hidden(ctx, int(lent), False)
    assert not leaks, f"hidden games shown on shelves: {leaks} (library has {len(hidden)} hidden games)"


def _smart_fixture_shelf(ctx, preferred: str = "qa_random"):
    settings = _settings(ctx)
    smart = [sh for sh in settings.get("smartShelves", []) if str(sh.get("id", "")).startswith("qa_")]
    if not smart:
        raise SkipTest("smart-shelf QA fixture not active (pnpm run qa:smart-fixture)")
    ids = [sh["id"] for sh in smart]
    return preferred if preferred in ids else ids[0]


@s.test("hiding a game on a smart shelf removes it and persists on that shelf")
def _(ctx) -> None:
    # The smart-shelf fixture is a standing override: it rebuilds smartShelves on every settings
    # change, so a Hide never lands in memory there. Checked by hand on a real smart shelf (card X).
    raise SkipTest("the smart fixture rebuilds its smart shelves on every change; check by hand on a real smart shelf")


@s.test("the Roulette's refresh card changes the order")
def _(ctx) -> None:
    import json
    _home(ctx)
    shelf_id = _smart_fixture_shelf(ctx, "qa_random")
    if shelf_id != "qa_random":
        raise SkipTest("no Roulette in the fixture")
    _reveal(ctx, shelf_id)
    before = ctx.eval(_CARDS_OF % json.dumps(shelf_id), timeout=8) or []
    if len(before) < 4:
        raise SkipTest(f"Roulette shows {len(before)} games, not enough to judge an order")
    orders = [before]
    for _ in range(2):
        res = ctx.eval("""
(async function(shelfId){
    const shelf = document.querySelector('.ds-shelf[data-shelfid="' + shelfId + '"]');
    if (!shelf) return { err: 'no shelf' };
    // The trailing refresh card may sit past the row's virtualized window: take the
    // row item itself (isRefresh) from the row's React props and fire its onActivate.
    let fired = false;
    const icon = shelf.querySelector('.ds-refresh-icon, .ds-refresh-card');
    const start = icon || shelf.querySelector('.ds-card') || shelf;
    const fk = Object.keys(start).find(k => k.startsWith('__reactFiber$'));
    for (let f = fk && start[fk], d = 0; f && d < 30 && !fired; f = f.return, d++) {
      const p = f.memoizedProps;
      if (icon && p && typeof p.onActivate === 'function') { p.onActivate(); fired = true; break; }
      const items = p && Array.isArray(p.items) ? p.items : null;
      const item = items && items.find(i => i && i.isRefresh && typeof i.onActivate === 'function');
      if (item) { item.onActivate(); fired = true; }
    }
    if (!fired) return { err: 'no refresh item', cards: shelf.querySelectorAll('.ds-card').length };
    await new Promise(r => setTimeout(r, 3000));
    return { order: [...shelf.querySelectorAll('.ds-card[data-appid]')].map(c => c.getAttribute('data-appid')) };
})(%s)
""" % json.dumps(shelf_id), timeout=20)
        assert res and not res.get("err"), f"refresh failed: {res}"
        orders.append(res["order"])
    assert any(o != orders[0] for o in orders[1:]), f"two refreshes kept the same order: {orders[0][:6]}"
