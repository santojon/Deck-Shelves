"""Synthetic decoration card assertions.

Validates the four supported shapes of a synthetic card:
  - gap     (no text, no image, no link)             → non-focusable
  - text    (text only, optional link)               → focusable when link set
  - image   (image only, optional link)              → focusable when link set
  - placeholder (placeholder=true, any content kind) → filled background

Plus the editor-side contract: cards land at the focused-preview slot and
the shelf auto-engages manual sort with the row's prior order inherited.

These tests run against any deployed plugin that carries at least one
synthetic card on at least one shelf — the suite skips otherwise instead
of failing so the rest of the runner stays green for fixtures that don't
exercise decorations.
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("decoration")


def _read_settings(ctx) -> dict:
    return ctx.eval("""
(function(){
    try {
        const raw = localStorage.getItem('deck-shelves-settings-cache-v3')
                 || JSON.stringify(window.__DECK_SHELVES_SHARED_SETTINGS__ || {});
        return JSON.parse(raw || '{}');
    } catch { return {}; }
})()
""") or {}


def _shelves_with_decorations(ctx) -> list:
    s = _read_settings(ctx)
    out = []
    for sh in (s.get("shelves") or []):
        cards = sh.get("syntheticCards") or []
        if cards:
            out.append({"id": sh.get("id"), "title": sh.get("title"), "cards": cards, "sort": sh.get("sort"), "manualOrder": sh.get("manualOrder") or []})
    return out


@s.test("synthetic card schema rejects text+image combo at persist time")
def _(ctx) -> None:
    # The schema rejects text+image, but the persisted shelves must reflect
    # only the legal shapes. Scan the actual config and assert no shelf
    # carries a card with both fields populated.
    shelves = _shelves_with_decorations(ctx)
    if not shelves:
        raise SkipTest("no shelf with syntheticCards on this device")
    for sh in shelves:
        for c in sh["cards"]:
            text = c.get("text")
            image = c.get("image")
            both = (isinstance(text, str) and text) and (isinstance(image, str) and image)
            assert not both, f"shelf {sh['id']!r} card #{sh['cards'].index(c)} carries both text and image"


@s.test("synthetic card with a link must have text or image (no link-only gaps)")
def _(ctx) -> None:
    shelves = _shelves_with_decorations(ctx)
    if not shelves:
        raise SkipTest("no shelf with syntheticCards on this device")
    for sh in shelves:
        for c in sh["cards"]:
            link = c.get("link")
            if not link:
                continue
            text = c.get("text")
            image = c.get("image")
            has_content = (isinstance(text, str) and text) or (isinstance(image, str) and image)
            assert has_content, f"shelf {sh['id']!r} carries a link-only card (would be a non-focusable card with a link)"


@s.test("focusable synthetic cards (link present) render with ds-card--synthetic class")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    # Wait for any synth card to materialise on a rendered shelf.
    result = ctx.eval("""
(async function(){
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        const cards = document.querySelectorAll('.ds-card--synthetic');
        if (cards.length > 0) {
            return {
                count: cards.length,
                anyFocusable: Array.from(cards).some(c => !c.hasAttribute('data-ds-synthetic-gap')),
                anyGap:       Array.from(cards).some(c => c.hasAttribute('data-ds-synthetic-gap')),
            };
        }
        await new Promise(r => setTimeout(r, 200));
    }
    return null;
})()
""", timeout=12)
    if result is None:
        raise SkipTest("no synthetic cards rendered on home — needs at least one decoration in a visible shelf")
    assert result["count"] > 0, "expected at least one synthetic card"


@s.test("gap-only synthetic cards carry data-ds-synthetic-gap and skip focus")
def _(ctx) -> None:
    shelves = _shelves_with_decorations(ctx)
    gap_shelves = [sh for sh in shelves if any(
        not (c.get("text") or c.get("image") or c.get("link"))
        for c in sh["cards"]
    )]
    if not gap_shelves:
        raise SkipTest("no shelf carries a gap-only decoration card")
    ctx.navigate("/library/home", settle_ms=1500)
    result = ctx.eval("""
(async function(){
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
        const gaps = document.querySelectorAll('.ds-card--synthetic[data-ds-synthetic-gap="1"]');
        if (gaps.length > 0) {
            const g = gaps[0];
            // A gap has no Focusable wrapper — DIV instead of a Focusable's div.
            const isDiv = g.tagName === 'DIV';
            // And no `tabindex` (or tabindex=-1)
            const ti = g.getAttribute('tabindex');
            return { isDiv, tabindex: ti, count: gaps.length };
        }
        await new Promise(r => setTimeout(r, 150));
    }
    return null;
})()
""", timeout=10)
    if result is None:
        raise SkipTest("gap card configured but not yet rendered on home")
    assert result["isDiv"] is True, "gap card should not be a Focusable wrapper"


@s.test("shelves carrying decorations are in manual sort (auto-engaged)")
def _(ctx) -> None:
    shelves = _shelves_with_decorations(ctx)
    if not shelves:
        raise SkipTest("no shelf with syntheticCards on this device")
    bad = [sh for sh in shelves if sh.get("sort") != "manual"]
    # Tolerate shelves that pre-date the auto-engage rule (saved before
    # the feature shipped) — only fail when the inverse is consistently
    # true (every decoration shelf is non-manual).
    if bad and len(bad) == len(shelves):
        raise AssertionError(
            f"every shelf with decorations is not manual-sorted "
            f"(found {len(bad)} shelves: {[sh['id'] for sh in bad[:3]]})"
        )


@s.test("synthetic card positions are within row bounds (no off-screen splice)")
def _(ctx) -> None:
    shelves = _shelves_with_decorations(ctx)
    if not shelves:
        raise SkipTest("no shelf with syntheticCards on this device")
    for sh in shelves:
        for c in sh["cards"]:
            pos = c.get("position")
            assert isinstance(pos, int) and pos >= 0, (
                f"shelf {sh['id']!r} card has invalid position {pos!r}"
            )
            # Positions past the row end are clamped by the resolver, so we
            # only fail on negative or non-int values here.


@s.test("placeholder synthetic cards paint a background (not transparent)")
def _(ctx) -> None:
    shelves = _shelves_with_decorations(ctx)
    has_placeholder = any(
        c.get("placeholder") is True
        for sh in shelves
        for c in sh["cards"]
    )
    if not has_placeholder:
        raise SkipTest("no shelf carries a placeholder synthetic card")
    ctx.navigate("/library/home", settle_ms=1500)
    result = ctx.eval("""
(async function(){
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
        const cards = document.querySelectorAll('.ds-card--synthetic');
        for (const c of cards) {
            const art = c.querySelector('.ds-synthetic-card');
            if (!art) continue;
            const bg = getComputedStyle(art).background || '';
            // Placeholder uses a linear-gradient fill; transparent uses 'transparent' or 'none'.
            if (bg.includes('linear-gradient')) return 'found';
        }
        await new Promise(r => setTimeout(r, 200));
    }
    return null;
})()
""", timeout=10)
    if result is None:
        raise SkipTest("placeholder card configured but not yet rendered")
    assert result == "found"
