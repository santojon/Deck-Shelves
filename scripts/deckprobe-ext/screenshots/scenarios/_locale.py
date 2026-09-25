"""Force the plugin UI to a given locale before capturing screenshots.

All capture scenarios call this before matching tab/menu labels, so label
needles can stay predictable regardless of the device's Steam language. The
plugin exposes `globalThis.__dsSetLocale` (src/i18n.ts) in the SharedJSContext
realm; this is a best-effort no-op on an older build without the hook.
"""
from __future__ import annotations

import os

from deckprobe.screenshots.lib.cdp import Session

DEFAULT_LOCALE = "en-US"


def force_locale(sjc: Session, locale: str | None = None) -> None:
    """Force the plugin UI to `locale`. Resolution order: explicit arg →
    `--locale` passed to the runner (`DECKPROBE_SCREENSHOTS_LOCALE` env,
    set by `screenshots/run.py`) → `DEFAULT_LOCALE` — so every existing
    call site (`force_locale(sjc)`, no args) keeps today's exact behavior
    unless `--locale` is passed."""
    target = locale or os.environ.get("DECKPROBE_SCREENSHOTS_LOCALE") or DEFAULT_LOCALE
    try:
        sjc.evaluate(f"try{{globalThis.__dsSetLocale&&globalThis.__dsSetLocale({target!r})}}catch(e){{}}")
    except Exception:
        pass


# Back-compat alias — every existing call site (`about.py`, `settings.py`,
# `modals.py`) calls this with no args, which already resolves the same way.
force_english = force_locale
