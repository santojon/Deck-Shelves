"""Open Decky's Quick Access tab with the Deck Shelves panel actually VISIBLE.

The toolkit's `navigate_to_ds_qam()` returns as soon as a `.deck-shelves-qam-scope`
exists in the QuickAccess target — but on a two-host install the neutral host keeps a
hidden copy of the panel mounted in its own tab, which satisfies that check with the
menu closed (every rect 0, and `Page.captureScreenshot` then hangs). This helper
toggles the menu, clicks the visible loader tab and the visible "Deck Shelves" entry,
and only reports success once a title-bar icon button has a non-zero size.

Usage (from a probe run at the repo root):
    from scripts.deckprobe_ext_lib import ...  # not a package — add the path instead:
    sys.path.insert(0, "scripts/deckprobe-ext/lib"); from ds_qam import open_decky_ds_tab
"""
from __future__ import annotations

import time

from deckprobe.screenshots.lib import nav
from deckprobe.screenshots.lib.cdp import open_session

# The wand (setup wizard) icon only exists in the plugin's title row.
VISIBLE_PANEL = """(() => Array.from(document.querySelectorAll('button')).filter(b => (b.innerHTML||'').includes('M14 6l4 4-10 10-4-4z') && b.getBoundingClientRect().width > 0).length)()"""
DECKY_TAB = """(() => { const tabs = Array.from(document.querySelectorAll('[role=tab]')).filter(t => t.getBoundingClientRect().width > 0); const t = tabs.find(t => { const s = t.querySelector('svg'); return s && s.innerHTML.indexOf('M320') !== -1; }); if (!t) return 'no-decky-tab:' + tabs.length; t.click(); return 'ok'; })()"""
DS_ENTRY = """(() => { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { if ((n.textContent||'').trim() !== 'Deck Shelves') continue; let el = n.parentElement; if (!el || el.getBoundingClientRect().width === 0) continue; for (let i = 0; i < 8 && el; i++) { if (el.classList && el.classList.contains('Focusable') && !el.querySelector('svg path[d*="M14 6l4 4"]')) { el.click(); return 'clicked'; } el = el.parentElement; } } return 'not-found'; })()"""


def visible_ds_panel(host: str, port: int) -> bool:
    """True when the plugin's title row is on screen in the Quick Access menu."""
    return bool(nav._qam_eval(host, port, VISIBLE_PANEL))


def open_decky_ds_tab(host: str, port: int, tries: int = 4) -> bool:
    """Toggle the menu and click through to the loader's Deck Shelves tab until the
    panel is visible. Returns False when it never became visible."""
    for _ in range(tries):
        if visible_ds_panel(host, port):
            return True
        nav._qam_eval(host, port, DECKY_TAB); time.sleep(1.0)
        nav._qam_eval(host, port, DS_ENTRY); time.sleep(1.2)
        if visible_ds_panel(host, port):
            return True
        sjc = open_session(host, port, "SharedJSContext")
        try:
            sjc.evaluate(nav.OPEN_QAM_EXPR)
        finally:
            sjc.close()
        time.sleep(1.6)
    return False
