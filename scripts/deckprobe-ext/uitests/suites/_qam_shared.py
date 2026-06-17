"""Shared QAM helpers consumed by every `qam_*` suite.

Prefixed with `_` so the runner's external-suites loader skips it
(see `deckprobe/uitests/run.py` — files starting with `_` aren't loaded
as suites). The first suite that needs the helpers imports this module
through `_qam_shared_import()` below, which guarantees a single shared
copy even when the runner reloads suites under spec_from_file_location.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

from deckprobe.screenshots.lib.cdp import open_session

_DECKY_PANEL = "quickaccess_content_999"
_DECKY_TAB = "quickaccess_tab_999"


def _ensure_qam_session(ctx) -> bool:
    if ctx.qam is None:
        try:
            ctx.qam = open_session(ctx.host, ctx.port, "QuickAccess")
            return True
        except Exception:
            return False
    try:
        ctx.eval_qam("1+1")
        return True
    except Exception:
        try:
            ctx.qam.close()
        except Exception:
            pass
        try:
            ctx.qam = open_session(ctx.host, ctx.port, "QuickAccess")
            return True
        except Exception:
            return False


def _open_qam_and_decky_tab(ctx) -> bool:
    """Open QAM fresh and navigate to Decky plugins tab. Returns True when
    the plugin list shows 'Deck Shelves'."""
    ctx.close_qam(settle_ms=400)
    ctx.open_qam(settle_ms=2500)

    if not _ensure_qam_session(ctx):
        return False

    ctx.eval_qam(f"document.getElementById({_DECKY_TAB!r})?.click()")
    time.sleep(1.5)

    result = ctx.eval_qam(f"""
(async function(){{
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {{
        var p = document.getElementById("{_DECKY_PANEL}");
        if (p && p.querySelectorAll("button").length > 5) return true;
        var btns = p?.querySelectorAll("button");
        if (btns && btns.length > 0 && btns.length < 5) {{ btns[0].click(); }}
        await new Promise(r => setTimeout(r, 400));
    }}
    return false;
}})()""", timeout=12)
    return result is True


def _ds_in_plugin_list(ctx) -> bool:
    return ctx.eval_qam(f"""
(function(){{
    var p = document.getElementById("{_DECKY_PANEL}");
    return Array.from(p?.querySelectorAll("button") || [])
        .some(b => (b.textContent||"").trim() === "Deck Shelves");
}})()""") is True


def _require_qam(ctx):
    """Open QAM to Decky tab. Raises SkipTest if unavailable."""
    # Import lazily so the runner module is resolvable wherever we're
    # loaded from (the importlib spec path doesn't add scripts/ to sys.path).
    from deckprobe.uitests.lib.runner import SkipTest
    if not _open_qam_and_decky_tab(ctx):
        raise SkipTest("Decky QAM plugin list not accessible")
    if not _ds_in_plugin_list(ctx):
        ctx.close_qam()
        raise SkipTest("Deck Shelves not found in Decky plugin list")


# ── Import helper for sibling qam_* suites ────────────────────────────────
# Suites loaded via importlib.util.spec_from_file_location can't use
# `from .qam_shared import …` style relative imports. Each sibling instead
# calls `_qam_shared_import()` which locates THIS file by path, loads it as
# a regular module under a stable sys.modules name, and returns the module
# object. Idempotent — repeat calls return the already-loaded copy.
_SHARED_MODULE_NAME = "_deckprobe_qam_shared"


def _qam_shared_import():
    if _SHARED_MODULE_NAME in sys.modules:
        return sys.modules[_SHARED_MODULE_NAME]
    here = Path(__file__).resolve()
    spec = importlib.util.spec_from_file_location(_SHARED_MODULE_NAME, here)
    if not spec or not spec.loader:
        raise RuntimeError("could not load _qam_shared")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[_SHARED_MODULE_NAME] = mod
    spec.loader.exec_module(mod)
    return mod
