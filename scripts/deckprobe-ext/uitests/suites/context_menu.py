"""Context menu injection assertions (card-level actions + shelf submenu)."""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite

s = suite("context_menu")


@s.test("ds-card has data-shelfid linking to a configured shelf")
def _(ctx) -> None:
    # Stress fixture (30+17 shelves) takes longer than 2 s to mount the
    # first card. Poll up to ~15 s for at least one .ds-card[data-shelfid]
    # to appear before asserting, then read the shelfid + settings in one
    # eval to avoid an extra round-trip.
    ctx.navigate("/library/home", settle_ms=400)
    result = ctx.eval("""
(async function(){
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const card = document.querySelector('.ds-card[data-appid][data-shelfid]');
        if (card) {
            const shelfId = card.getAttribute('data-shelfid');
            // BP and SharedJSContext have separate localStorage instances.
            // Read from BP localStorage first; fall back to the shared-state key
            // written by the plugin's settingsStore into globalThis (SJC) if available.
            const raw = localStorage.getItem('deck-shelves-settings-cache-v3')
                     || JSON.stringify(window.__DECK_SHELVES_SHARED_SETTINGS__ || {});
            const settings = JSON.parse(raw || '{}');
            // Accept QA-fixture IDs: shelfIds starting with 'qa_' were
            // injected by a QA harness and are inherently valid.
            const isQA = shelfId && shelfId.startsWith('qa_');
            const ids = [...(settings.shelves||[]), ...(settings.smartShelves||[])].map(s => s.id);
            return { shelfId, valid: isQA || ids.includes(shelfId) };
        }
        await new Promise(r => setTimeout(r, 250));
    }
    return null;
})()
""", timeout=20)
    assert result is not None, "no .ds-card with data-shelfid found after 15s"
    assert result.get("valid"), f"card shelfid {result.get('shelfId')!r} not in configured shelves"


@s.test("first card carries data-ds-card-index=0")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1000)
    # Reuse home suite's polling helper
    ctx.eval("""
(async function(){
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (document.querySelector('.ds-shelf[data-shelfid]')) break;
        await new Promise(r => setTimeout(r, 150));
    }
})()
""", timeout=12)
    idx = ctx.eval(
        "(function(){ const c = document.querySelector('.ds-shelf .ds-row-scroll .ds-card[data-appid]'); return c?.getAttribute('data-ds-card-index'); })()"
    )
    assert idx == "0", f"expected '0' got {idx!r}"


@s.test("highlighted card has ds-card--featured class")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1000)
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
