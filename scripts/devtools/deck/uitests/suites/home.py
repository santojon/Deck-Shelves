"""Home screen render assertions."""
from __future__ import annotations

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
    appid = ctx.eval(
        "(function(){ const c = document.querySelector('.ds-card[data-appid]'); return c ? c.getAttribute('data-appid') : null; })()"
    )
    assert appid and appid != "", f"first card missing data-appid (got {appid!r})"


@s.test("card width within expected range")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    width = ctx.eval("(function(){ const c = document.querySelector('.ds-card'); return c ? c.offsetWidth : 0; })()")
    assert isinstance(width, (int, float)) and 80 <= width <= 800, f"unexpected card width: {width}"


@s.test("mount element present and non-empty")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    height = ctx.eval(
        "(function(){ const el = document.getElementById('deck-shelves-home-root'); return el ? el.offsetHeight : 0; })()"
    )
    assert isinstance(height, (int, float)) and height > 0, f"mount element height={height} (collapsed or missing)"


@s.test("no console errors during home render")
def _(ctx) -> None:
    # Inject error collector before navigating
    ctx.sjc.evaluate("window.__dsTestErrors = []; window.onerror = function(m){ window.__dsTestErrors.push(m); };")
    ctx.navigate("/library/home", settle_ms=2000)
    errors = ctx.eval("window.__dsTestErrors || []")
    ds_errors = [e for e in (errors or []) if isinstance(e, str) and ("ds-" in e or "deck-shelves" in e.lower())]
    assert not ds_errors, f"DS errors on home: {ds_errors[:3]}"


@s.test("card index attribute set on first card")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    idx = ctx.eval(
        "(function(){ const c = document.querySelector('.ds-card[data-appid]'); return c ? c.getAttribute('data-ds-card-index') : null; })()"
    )
    assert idx == "0", f"first card data-ds-card-index expected '0', got {idx!r}"


@s.test("native recents not collapsed when plugin disabled")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    settings = ctx.eval(
        "(function(){ try { return JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}'); } catch { return {}; } })()"
    )
    if not isinstance(settings, dict) or settings.get("enabled") is not False:
        return  # plugin enabled — skip this check
    native_h = ctx.eval(
        "(function(){ const el = document.querySelector('[class*=\"RecentGames\"], [class*=\"recentGames\"]'); return el ? el.offsetHeight : -1; })()"
    )
    assert isinstance(native_h, (int, float)) and native_h > 0, \
        f"native recents collapsed when plugin disabled (height={native_h})"


@s.test("shelf shelfid attribute matches configured shelf id")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    result = ctx.eval("""
(function(){
    const raw = localStorage.getItem('deck-shelves-settings-cache-v3')
             || JSON.stringify(window.__DECK_SHELVES_SHARED_SETTINGS__ || {});
    const settings = JSON.parse(raw || '{}');
    const configuredRegular = (settings.shelves || []).filter(s => s.enabled && !s.hidden).map(s => s.id);
    const configuredSmart   = (settings.smartShelves || []).filter(s => s.enabled !== false && !s.hidden).map(s => s.id);
    const configured = [...configuredRegular, ...configuredSmart];
    const rendered = Array.from(document.querySelectorAll('.ds-shelf[data-shelfid]')).map(el => el.getAttribute('data-shelfid'));
    // QA fixture IDs (qa_*) are always valid — they come from harness overrides
    // that may only exist in SharedJSContext's localStorage, not BigPicture's.
    const mismatch = rendered.filter(id => !configured.includes(id) && !id.startsWith('qa_'));
    return { configured: configured.length, rendered: rendered.length, mismatch };
})()
""")
    if isinstance(result, dict):
        assert not result.get("mismatch"), f"Rendered shelves with unknown IDs: {result['mismatch']}"
