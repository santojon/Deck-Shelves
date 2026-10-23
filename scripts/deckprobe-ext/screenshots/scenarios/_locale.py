"""Force the plugin UI to a given locale before capturing screenshots.

All capture scenarios call this before matching tab/menu labels, so label
needles can stay predictable regardless of the device's Steam language. The
plugin exposes `globalThis.__dsSetLocale` (src/i18n.ts) in the SharedJSContext
realm; this is a best-effort no-op on an older build without the hook.
"""
from __future__ import annotations

import os

from deckprobe.screenshots.lib.cdp import Session, open_session

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


def gamepad_glyphs(host: str, port: int) -> None:
    """Put Steam's footer hints back in controller mode right before a capture.

    Every key the scenarios send over the debug protocol (an Escape to close a
    dialog, an arrow to move focus) makes Steam treat a keyboard as the active
    input, and the footer then shows Esc / Enter / F9 instead of the B / A / X
    glyphs a Deck user sees. The navigation source lives on the shared context's
    `FocusNavController`; forcing it back is what a real controller press does."""
    try:
        sjc = open_session(host, port, "SharedJSContext")
        try:
            sjc.evaluate("try{FocusNavController.UpdateSourceToGamepad(true)}catch(e){}")
        finally:
            sjc.close()
    except Exception:
        pass
