"""Force the plugin UI to English for deterministic release screenshots.

All capture scenarios call this before matching tab/menu labels, so the
needles can be plain English regardless of the device's Steam language. The
plugin exposes `globalThis.__dsSetLocale` (src/i18n.ts) in the SharedJSContext
realm; this is a best-effort no-op on an older build without the hook.
"""
from __future__ import annotations

from deckprobe.screenshots.lib.cdp import Session


def force_english(sjc: Session) -> None:
    try:
        sjc.evaluate("try{globalThis.__dsSetLocale&&globalThis.__dsSetLocale('en-US')}catch(e){}")
    except Exception:
        pass
