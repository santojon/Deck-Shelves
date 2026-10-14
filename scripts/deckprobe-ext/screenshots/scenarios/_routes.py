"""Navigation to the plugin's own full-page routes (About, Settings, the editors).

A dev build publishes `__ds_dev_navigate`, which goes through the loader's
own navigation; on some boots the window instance's `Navigate` lands on the
route with an empty page while the loader's path renders it, so the hook is
tried first and the toolkit's primitive is the fallback (release builds)."""
from __future__ import annotations

import time

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib import nav


def navigate_route(sjc: Session, route: str, settle_ms: int = 2000) -> None:
    hooked = None
    try:
        hooked = sjc.evaluate(f"(function(){{try{{return window.__ds_dev_navigate ? window.__ds_dev_navigate({route!r}) : null;}}catch(e){{return null;}}}})()")
    except Exception:
        hooked = None
    if hooked is True:
        time.sleep(settle_ms / 1000.0)
        return
    nav.navigate(sjc, route, settle_ms=settle_ms)
