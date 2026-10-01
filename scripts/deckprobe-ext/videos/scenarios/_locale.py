"""Force the plugin UI to a given locale before recording — same hook and
convention as the screenshot scenarios' own `_locale.py`, kept as a separate
copy since video scenarios load as their own namespace package (relative
imports don't cross between the two scenario directories)."""
from __future__ import annotations

import os

from deckprobe.screenshots.lib.cdp import Session

DEFAULT_LOCALE = "en-US"


def force_locale(sjc: Session, locale: str | None = None) -> None:
    """Resolution order: explicit arg -> --locale passed to the runner
    (DECKPROBE_VIDEOS_LOCALE, set by deckprobe/videos/run.py) -> DEFAULT_LOCALE."""
    target = locale or os.environ.get("DECKPROBE_VIDEOS_LOCALE") or DEFAULT_LOCALE
    try:
        sjc.evaluate(f"try{{globalThis.__dsSetLocale&&globalThis.__dsSetLocale({target!r})}}catch(e){{}}")
    except Exception:
        pass
