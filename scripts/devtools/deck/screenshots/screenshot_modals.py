#!/usr/bin/env python3
"""Per-modal screenshot helpers. Split from screenshot.py to keep both files
under the per-file code-line cap. Imported back by screenshot.py and called
from `main()` there."""
import json
import time
from pathlib import Path
from typing import Dict, Optional

import os
import sys

# Allow this module to import from the sibling script regardless of how it
# was invoked (direct `python3 screenshot.py` vs `python3 -m ...`).
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from screenshot import (  # type: ignore[import-not-found]
    _open_qam_and_tab,
    cancel_bp_modal,
    capture_bigpicture,
    capture_qam_with_fallback,
    click_deckshelves_tab,
    click_qam_button,
    close_qam,
    dismiss_bp_escape,
    eval_target,
    open_qam,
    ws_path_for,
)
def screenshot_shelf_edit(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture Edit shelf modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Find and click the Edit menu item (matches Editar/Edit)
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1) {
            el.click(); return 'ok';
        }
    }
    var first = document.querySelector('[role=menuitem]');
    if (first) { first.click(); return 'first'; }
})()
""")
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-edit.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_hidden(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM showing a hidden shelf."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Click Hide/Ocultar
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('hide') !== -1 || t.indexOf('ocultar') !== -1) { el.click(); return 'ok'; }
    }
})()
""")
        # Force QAM refresh: close and reopen QAM/tab to ensure UI updates
        close_qam(host, port, shared_ws)
        time.sleep(1.0)
        open_qam(host, port, shared_ws)
        time.sleep(1.5)
        click_deckshelves_tab(host, port, qam_ws)
        time.sleep(2.0)  # Longer delay to ensure UI reflects hidden shelf
        result = capture_qam_with_fallback(host, port, bp, qam_target, "shelf-hidden.png")

        # Toggle back (Show/Mostrar)
        if click_qam_button(host, port, qam_ws, "cx=", 0):
            time.sleep(1.0)
            eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('show') !== -1 || t.indexOf('mostrar') !== -1) { el.click(); return 'ok'; }
    }
})()
""")
            time.sleep(0.5)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_delete(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture delete shelf confirmation dialog."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Click Delete/Apagar (match exact text to avoid clicking wrong item)
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text === 'Delete' || text === 'Apagar') { el.click(); return 'ok'; }
    }
})()
""")
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-delete.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_create_shelf(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the template picker modal (create shelf)."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the "+" (add) button — SVG contains "M12 5v14" (vertical bar of plus)
    clicked = click_qam_button(host, port, qam_ws, "M12 5v14", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "M5 12h14", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-create.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find add/create button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_import_shelf(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the import modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the import button — SVG contains "M12 18v-6" (down arrow)
    clicked = click_qam_button(host, port, qam_ws, "M12 18v-6", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "m9 15", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-import.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find import button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_import(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture import shelves modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    clicked = click_qam_button(host, port, qam_ws, "M12 18v-6", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "m9 15", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-import.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find import button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_export(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture export shelves modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    clicked = click_qam_button(host, port, qam_ws, "M12 12v6", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "m15 15", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-export.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find export button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_reset_all(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture the destructive Reset-all confirmation modal.

    Reset-all is the *rightmost* icon-only DialogButton in the QAM footer row
    (Import all | Export all | Reset all). It shares the icon-only footprint
    with its siblings, so picking "widest button at bottom" picks one at
    random. Instead we locate it by the unique SVG path of the reset icon
    (`M3 12a9 9 0 1 0 3-6.7` — a circular-arrow shape) that
    `src/components/qam/icons.tsx` uses.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Scroll to the very bottom so the footer row is in view before clicking.
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (scope) scope.scrollTop = scope.scrollHeight;
    return 'ok';
})()
""")
    time.sleep(0.5)
    clicked = eval_target(host, port, qam_ws, r"""
(function(){
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Match the circular-arrow path unique to the reset icon in icons.tsx.
    // Use the FULL QAM scope and then pick the LAST match — that's the footer
    // reset-all button, not the per-section reset buttons higher up.
    var btns = Array.from(scope.querySelectorAll('button')).filter(function(b){
        return b.innerHTML.indexOf('M3 12a9 9 0 1 0 3-6.7') !== -1;
    });
    if (!btns.length) return 'no-reset-icon';
    var target = btns[btns.length - 1];
    target.click();
    var r = target.getBoundingClientRect();
    return 'clicked:bottom=' + Math.round(r.bottom) + ',count=' + btns.length;
})()
""")
    print(f"    reset button: {clicked}")
    if not (isinstance(clicked, str) and clicked.startswith("clicked")):
        close_qam(host, port, shared_ws)
        time.sleep(0.5)
        return None
    time.sleep(2.0)
    # ResetAllModal goes through Decky's `showModal`, which renders into the
    # Big Picture modal root (not the QAM popup). Capture BP so the
    # confirmation dialog is visible on top of the home.
    result = capture_bigpicture(host, port, bp, "reset-all.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_about_page(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the About / Filter Documentation page."""
    ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the book icon button (About) in the QAM title bar
    clicked = click_qam_button(host, port, qam_ws, "M4 19.5A2.5", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "M4 4.5v15", 0)
    if clicked:
        time.sleep(2.5)
        result = capture_bigpicture(host, port, bp, "about-page.png")
        # Press Escape to close the about page
        dismiss_bp_escape(host, port, bp)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find About button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_smart_shelves_qam(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Smart Shelves section."""
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    # Scroll the QAM scope to the smart shelves toggle
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Find the smart shelves toggle by scanning ToggleField labels
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    while (node = walker.nextNode()) {
        var txt = (node.textContent || '').trim();
        if (txt.length > 3 && txt.length < 80 &&
            (txt.toLowerCase().indexOf('smart') !== -1 || txt.toLowerCase().indexOf('prateleira') !== -1)) {
            var el = node.parentElement;
            if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'scrolled:' + txt.substring(0, 30); }
        }
    }
    // Fallback: scroll to 60% of the QAM scope height
    scope.scrollTop = Math.floor(scope.scrollHeight * 0.6);
    return 'fallback-scroll';
})()
""")
    time.sleep(1.0)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "smart-shelves-qam.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_smart_shelf_modal(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the Smart Shelf template picker modal."""
    if not qam_ws:
        return None
    bp_ws = ws_path_for(bp, port)
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    # Scroll to the bottom of the QAM scope to reveal the smart shelves add button
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (scope) scope.scrollTop = scope.scrollHeight;
})()
""")
    time.sleep(0.5)

    # Click add button inside the smart shelves section (smaller Focusable after SmartShelvesFirstRunBanner or list)
    clicked = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Find the button/Focusable that appears inside the smart shelves section (after smart_section_header)
    var headers = Array.from(scope.querySelectorAll('[class*="section-header"], [class*="sectionHeader"]'));
    var smartHeader = null;
    for (var h of headers) {
        var txt = (h.textContent || '').toLowerCase();
        if (txt.indexOf('smart') !== -1 || txt.indexOf('inteligente') !== -1) {
            smartHeader = h; break;
        }
    }
    if (smartHeader) {
        // Find the next sibling add button
        var sib = smartHeader.nextElementSibling;
        while (sib) {
            var btn = sib.querySelector('button, [role="button"]');
            if (btn) { btn.click(); return 'clicked-after-header'; }
            sib = sib.nextElementSibling;
        }
    }
    // Fallback: find the SmartShelvesFirstRunBanner button
    var allBtns = Array.from(scope.querySelectorAll('button'));
    // Try to find a button whose text or SVG hints at "add"
    for (var b of allBtns) {
        if (b.innerHTML.indexOf('M12 5v14') !== -1 || b.innerHTML.indexOf('M5 12h14') !== -1) {
            // Check it's in lower half of QAM
            var r = b.getBoundingClientRect();
            if (r.top > 200) { b.click(); return 'clicked-add-btn'; }
        }
    }
    return 'not-found';
})()
""")
    print(f"    smart-shelf-modal click: {clicked}")
    time.sleep(2.0)

    result = capture_bigpicture(host, port, bp, "smart-shelf-modal.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(0.5)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_global_toggles(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Apply Globally (visual_global) section.

    Visual Global is the *second-to-last* CollapsibleSection in the QAM —
    just above the Saved Filters section (which may be hidden) and the
    footer row. Scrolling blindly to `scope.scrollHeight` lands on the
    footer instead. We find the section header by the i18n title and
    scroll it to the top of the view, then ensure it's expanded.
    """
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    scroll = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Section titles: the visual_global i18n key is rendered localized, so
    // match by common roots across locales.
    var needles = ['apply globally', 'aplicar globalmente', 'appliquer', 'global', 'globalmente'];
    var headers = Array.from(scope.querySelectorAll('.ds-collapsible-header, [class*="collapsible-header"], [class*="section-header"]'));
    var found = null;
    for (var h of headers) {
        var t = (h.textContent || '').toLowerCase();
        if (!t) continue;
        for (var n of needles) {
            if (t.indexOf(n) !== -1) { found = h; break; }
        }
        if (found) break;
    }
    if (!found) {
        // Fallback: walk text nodes — match i18n keys for Visual / highlight.
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        var node;
        while (node = walker.nextNode()) {
            var txt = (node.textContent || '').toLowerCase();
            if (txt.indexOf('match_native') !== -1 || txt.indexOf('highlight_first') !== -1 ||
                txt.indexOf('highlight_all') !== -1 || txt.indexOf('native size') !== -1) {
                var el = node.parentElement;
                if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'fallback-toggles'; }
            }
        }
        return 'not-found';
    }
    // Ensure the section is expanded before scrolling (if the collapsible
    // renders its content conditionally, clicking the header toggles it).
    var collapsed = found.getAttribute('aria-expanded') === 'false' ||
                    found.querySelector('[class*="collapse-icon"]')?.textContent === '+' ||
                    false;
    if (collapsed) { try { found.click(); } catch(_){} }
    found.scrollIntoView({ behavior: 'instant', block: 'start' });
    return 'scrolled-to-header';
})()
""")
    print(f"    global-toggles scroll: {scroll}")
    time.sleep(1.2)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "global-toggles.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_saved_filters_qam(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Saved Filters section.

    Saved Filters only renders when the user has at least one saved filter —
    when empty, the CollapsibleSection is hidden entirely. The scroll helper
    scans for the section header by i18n-aware text patterns and scrolls it
    into view; if not found (no saved filters yet), returns None instead of
    writing a misleading image.
    """
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    found = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    var matches = ['saved filter', 'filtros salvos', 'filtres enregistrés', 'gespeicherte filter', 'filtros guardados'];
    while (node = walker.nextNode()) {
        var txt = (node.textContent || '').trim().toLowerCase();
        if (!txt || txt.length > 80) continue;
        for (var m of matches) {
            if (txt.indexOf(m) !== -1) {
                var el = node.parentElement;
                while (el && el.parentElement !== scope && el.parentElement) el = el.parentElement;
                if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'scrolled:' + txt; }
            }
        }
    }
    return 'not-found';
})()
""")
    print(f"    saved-filters scroll: {found}")
    if not (isinstance(found, str) and found.startswith("scrolled:")):
        close_qam(host, port, shared_ws)
        time.sleep(0.3)
        print("  [SKIP] Saved Filters section is hidden (no saved filters configured)")
        return None
    time.sleep(1.0)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "saved-filters-qam.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_edit_tab(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, tab_label: str, filename: str) -> Optional[Path]:
    """Open the Edit shelf modal and activate a specific tab (Visual / Filters / Source / Display).

    The tab bar is rendered by Decky's `Tabs` component; each tab is a
    Focusable with its label text. We click the tab whose textContent matches
    `tab_label` (case-insensitive, i18n-aware list of aliases) before capture.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not click_qam_button(host, port, qam_ws, "cx=", 0):
        close_qam(host, port, shared_ws)
        return None
    time.sleep(1.0)
    eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1 || text.indexOf('Modifier') !== -1 || text.indexOf('Bearbeiten') !== -1) {
            el.click(); return 'ok';
        }
    }
    var first = document.querySelector('[role=menuitem]');
    if (first) { first.click(); return 'first'; }
})()
""")
    time.sleep(2.0)
    click = eval_target(host, port, bp_ws, f"""
(function() {{
    var needle = {json.dumps(tab_label.lower())};
    var tabs = Array.from(document.querySelectorAll('[role="tab"], [class*="tab-bar-entry"], [class*="TabBar"] .Focusable, [class*="tabs_"] .Focusable'));
    for (var t of tabs) {{
        var txt = (t.textContent || '').trim().toLowerCase();
        if (!txt) continue;
        if (txt.indexOf(needle) !== -1) {{ t.click(); return 'clicked:' + txt; }}
    }}
    return 'not-found';
}})()
""")
    print(f"    tab click ({tab_label}): {click}")
    time.sleep(1.5)
    result = capture_bigpicture(host, port, bp, filename)
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_smart_shelf_edit(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the Edit Smart Shelf modal.

    Strategy: open QAM, scroll to the Smart Shelves list, click the ⋯ button
    on the first enabled smart shelf row, then click Edit / Editar. Returns
    None when Smart Shelves are disabled or no entries are enabled — the
    modal wouldn't be reachable in that state.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    while (node = walker.nextNode()) {
        var txt = (node.textContent || '').trim().toLowerCase();
        if (txt.indexOf('smart') !== -1 || txt.indexOf('inteligente') !== -1) {
            var el = node.parentElement;
            if (el) { el.scrollIntoView({ behavior: 'instant', block: 'center' }); return 'scrolled'; }
        }
    }
    return 'not-found';
})()
""")
    time.sleep(1.0)
    # Click the ⋯ button on the FIRST smart shelf row (they come after the regular shelves).
    clicked = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    var btns = Array.from(scope.querySelectorAll('button')).filter(b => b.innerHTML.indexOf('cx=') !== -1);
    // Heuristic: the LAST ⋯ in the scope is the one on the last row (smart shelf) most of the time;
    // fall back to clicking the ⋯ that sits below the smart header (positional).
    if (!btns.length) return 'no-ellipsis';
    var last = btns[btns.length - 1];
    last.click();
    return 'clicked-last';
})()
""")
    print(f"    smart-shelf ellipsis: {clicked}")
    if clicked != 'clicked-last':
        close_qam(host, port, shared_ws)
        return None
    time.sleep(1.0)
    eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1 || text.indexOf('Modifier') !== -1 || text.indexOf('Bearbeiten') !== -1) {
            el.click(); return 'ok';
        }
    }
})()
""")
    time.sleep(2.0)
    result = capture_bigpicture(host, port, bp, "smart-shelf-edit.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result
