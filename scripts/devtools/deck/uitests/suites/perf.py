"""Lightweight in-suite performance smoke tests."""
from __future__ import annotations

from ..lib.runner import suite

s = suite("perf")

MOUNT_WARN_MS = 3000
FRAME_WARN_MS = 50


@s.test("home mount time under 3 s")
def _(ctx) -> None:
    result = ctx.bp.evaluate("""
(async function(){
    performance.mark('ds-perf-start');
    try {
        if (typeof Router !== 'undefined' && Router?.Navigate) {
            Router.Navigate('/library');
            await new Promise(r => setTimeout(r, 300));
            Router.Navigate('/library/home');
        }
    } catch {}
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        if (document.querySelector('.ds-card[data-appid]')) break;
        await new Promise(r => setTimeout(r, 80));
    }
    performance.mark('ds-perf-end');
    performance.measure('ds-perf-mount', 'ds-perf-start', 'ds-perf-end');
    return +(performance.getEntriesByName('ds-perf-mount')[0]?.duration ?? -1).toFixed(1);
})()
""", timeout=15)
    assert isinstance(result, (int, float)) and result > 0, f"mount probe returned {result}"
    assert result < MOUNT_WARN_MS, f"mount took {result}ms (warn threshold {MOUNT_WARN_MS}ms)"


@s.test("rAF frame gap under 50 ms after home render")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    result = ctx.eval("""
(async function(){
    let max = 0, last = performance.now();
    await new Promise(resolve => {
        let n = 0;
        function tick(t){ const g = t - last; if (g > max) max = g; last = t; if (++n < 10) requestAnimationFrame(tick); else resolve(); }
        requestAnimationFrame(tick);
    });
    return +max.toFixed(1);
})()
""", timeout=5)
    assert isinstance(result, (int, float)), f"rAF probe returned {result}"
    assert result < FRAME_WARN_MS, f"max frame gap {result}ms (warn threshold {FRAME_WARN_MS}ms)"


@s.test("cards-per-shelf count within limits")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    result = ctx.eval("""
(function(){
    const shelves = Array.from(document.querySelectorAll('.ds-shelf[data-shelfid]'));
    return shelves.map(el => el.querySelectorAll('.ds-card[data-appid]').length);
})()
""")
    if not result:
        return
    over = [n for n in result if n > 200]
    assert not over, f"shelves with >200 cards rendered: {over} — reduce per-shelf limit"
