"""
Crash-protection test suite.

Drives high-risk interactions and asserts no DS-attributed console errors
appear during: menu open on 3 card types, QAM open×5, route navigation,
settings toggle round-trip.
"""
from __future__ import annotations

import time

from deckprobe.uitests.lib.runner import suite

s = suite("crash_protection")

# JS snippet that collects errors attributed to Deck Shelves
_INSTALL_COLLECTOR = """
(function(){
    window.__dsCrashErrors = [];
    const orig = window.onerror;
    window.onerror = function(msg, src, line, col, err) {
        const m = String(msg || '');
        const s = String(src || '');
        if (m.toLowerCase().includes('deck') || m.toLowerCase().includes('.ds-') ||
            s.includes('deck-shelves') || s.includes('index.js')) {
            window.__dsCrashErrors.push({msg: m.slice(0, 200), src: s.slice(0, 100)});
        }
        if (orig) return orig(msg, src, line, col, err);
    };
    const origUP = window.onunhandledrejection;
    window.onunhandledrejection = function(e) {
        const m = String(e?.reason?.message || e?.reason || '');
        if (m.toLowerCase().includes('deck') || m.toLowerCase().includes('.ds-')) {
            window.__dsCrashErrors.push({msg: m.slice(0, 200), type: 'rejection'});
        }
        if (origUP) return origUP(e);
    };
    return 'installed';
})()
"""

_READ_ERRORS = "(function(){ return window.__dsCrashErrors || []; })()"


def _assert_no_errors(ctx, step: str) -> None:
    errs = ctx.eval(_READ_ERRORS)
    if errs:
        raise AssertionError(f"{step}: DS errors detected: {errs[:3]}")


@s.test("no errors: home render cold")
def _(ctx) -> None:
    ctx.eval(_INSTALL_COLLECTOR)
    ctx.navigate("/library/home", settle_ms=3000)
    _assert_no_errors(ctx, "home cold render")


@s.test("no errors: navigate away and back 3x")
def _(ctx) -> None:
    ctx.eval(_INSTALL_COLLECTOR)
    for _ in range(3):
        ctx.navigate("/library", settle_ms=600)
        ctx.navigate("/library/home", settle_ms=1500)
    _assert_no_errors(ctx, "route navigate ×3")


@s.test("no errors: QAM open and close 5x")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=1500)
    ctx.eval(_INSTALL_COLLECTOR)
    for _ in range(5):
        ctx.open_qam(settle_ms=800)
        ctx.close_qam(settle_ms=400)
    _assert_no_errors(ctx, "QAM open×5")


@s.test("no errors: card menu on installed game card")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    ctx.eval(_INSTALL_COLLECTOR)
    ctx.eval("""
(function(){
    // Find a DS card for an installed game (data-appid present)
    const card = document.querySelector('.ds-shelf .ds-card[data-appid]');
    if (!card) return 'no card';
    // Dispatch contextmenu event to trigger DS menu injection
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(evt);
    return 'dispatched';
})()
""")
    time.sleep(1.0)
    _assert_no_errors(ctx, "card contextmenu")
    # Dismiss any open menu
    ctx.eval("try { document.activeElement?.blur(); } catch {} ")


@s.test("no errors: card menu on non-steam card (if present)")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    ctx.eval(_INSTALL_COLLECTOR)
    result = ctx.eval("""
(function(){
    // Non-Steam shortcuts have very high appids (> 10^9) or specific type
    const cards = Array.from(document.querySelectorAll('.ds-shelf .ds-card[data-appid]'));
    const nonSteam = cards.find(c => Number(c.getAttribute('data-appid')) > 1000000000);
    if (!nonSteam) return 'skip';
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    nonSteam.dispatchEvent(evt);
    return 'dispatched';
})()
""")
    if result == "skip":
        return  # no non-Steam card visible — test not applicable
    time.sleep(1.0)
    _assert_no_errors(ctx, "non-steam contextmenu")
    ctx.eval("try { document.activeElement?.blur(); } catch {} ")


@s.test("no errors: settings enable/disable round-trip")
def _(ctx) -> None:
    ctx.eval(_INSTALL_COLLECTOR)
    settings_before = ctx.eval("""
(function(){
    const s = JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
    return { enabled: !!s.enabled };
})()
""")
    if not isinstance(settings_before, dict):
        return
    # Toggle via the global event (simulates QAM toggle without opening QAM)
    ctx.eval("""
(function(){
    const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
    if (!raw) return;
    const s = JSON.parse(raw);
    s.enabled = !s.enabled;
    localStorage.setItem('deck-shelves-settings-cache-v3', JSON.stringify(s));
    window.dispatchEvent(new CustomEvent('deck-shelves-settings-changed', { detail: s }));
})()
""")
    time.sleep(1.0)
    # Restore
    ctx.eval("""
(function(){
    const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
    if (!raw) return;
    const s = JSON.parse(raw);
    s.enabled = !s.enabled;
    localStorage.setItem('deck-shelves-settings-cache-v3', JSON.stringify(s));
    window.dispatchEvent(new CustomEvent('deck-shelves-settings-changed', { detail: s }));
})()
""")
    time.sleep(1.0)
    _assert_no_errors(ctx, "settings enable/disable round-trip")


@s.test("no errors: scroll through all DS shelves")
def _(ctx) -> None:
    ctx.navigate("/library/home", settle_ms=2000)
    ctx.eval(_INSTALL_COLLECTOR)
    ctx.eval("""
(function(){
    const mount = document.getElementById('deck-shelves-home-root');
    if (!mount) return;
    let scr = mount.parentElement;
    while (scr) {
        const cs = getComputedStyle(scr);
        const oy = cs.overflowY.toLowerCase();
        if ((oy === 'auto' || oy === 'scroll') && scr.scrollHeight > scr.clientHeight) break;
        scr = scr.parentElement;
    }
    if (!scr) return;
    scr.scrollTop = scr.scrollHeight;
})()
""")
    time.sleep(1.5)
    _assert_no_errors(ctx, "scroll to bottom")
    ctx.eval("""
(function(){
    const mount = document.getElementById('deck-shelves-home-root');
    if (!mount) return;
    let scr = mount.parentElement;
    while (scr) {
        const cs = getComputedStyle(scr);
        const oy = cs.overflowY.toLowerCase();
        if ((oy === 'auto' || oy === 'scroll') && scr.scrollHeight > scr.clientHeight) break;
        scr = scr.parentElement;
    }
    if (scr) scr.scrollTop = 0;
})()
""")
    time.sleep(0.5)
    _assert_no_errors(ctx, "scroll back to top")
