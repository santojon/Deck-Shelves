"""Context menu injection assertions (card-level actions + shelf submenu)."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("context_menu")


@s.test("ds-card has data-shelfid linking to a configured shelf")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    result = ctx.eval("""
(function(){
    const card = document.querySelector('.ds-card[data-appid][data-shelfid]');
    if (!card) return null;
    const shelfId = card.getAttribute('data-shelfid');
    const settings = JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
    const ids = [...(settings.shelves||[]), ...(settings.smartShelves||[])].map(s => s.id);
    return { shelfId, valid: ids.includes(shelfId) };
})()
""")
    assert result is not None, "no .ds-card with data-shelfid found"
    assert result.get("valid"), f"card shelfid {result.get('shelfId')!r} not in configured shelves"


@s.test("first card carries data-ds-card-index=0")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    idx = ctx.eval(
        "(function(){ const c = document.querySelector('.ds-shelf .ds-row-scroll .ds-card[data-appid]'); return c?.getAttribute('data-ds-card-index'); })()"
    )
    assert idx == "0", f"expected '0' got {idx!r}"


@s.test("highlighted card has ds-card--featured class")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    result = ctx.eval("""
(function(){
    const settings = JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
    const anyHighlight = settings.globalHighlightFirst || settings.globalHighlightAll
        || (settings.shelves||[]).some(s => s.highlightFirst || s.highlightAll || (s.highlightedAppIds||[]).length > 0);
    if (!anyHighlight) return 'skipped';
    const featured = document.querySelector('.ds-card--featured');
    return featured ? 'found' : 'missing';
})()
""")
    if result == "skipped":
        return  # no highlight configured
    assert result == "found", "highlight configured but no .ds-card--featured found"
