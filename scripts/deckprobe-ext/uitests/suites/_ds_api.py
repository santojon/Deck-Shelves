"""Shared helpers for suites that exercise the public `window.deckShelves`
API. Underscore-prefixed so the runner's loader skips it as a suite.

The plugin installs `window.deckShelves` in whichever context Decky
mounts it into (SharedJSContext in practice, but Big Picture in some
boot orders). These helpers detect the live context once per run and
route evals there, so suites stay agnostic about where the API lives.
"""
from __future__ import annotations

_PROBE = "(typeof window!=='undefined' && window.deckShelves && window.deckShelves.api) ? 1 : 0"


def _detect(ctx):
    cached = getattr(ctx, "_ds_api_ctx", None)
    if cached:
        return cached
    try:
        if ctx.eval_sjc(_PROBE) == 1:
            ctx._ds_api_ctx = "sjc"
            return "sjc"
    except Exception:
        pass
    try:
        if ctx.eval(_PROBE) == 1:
            ctx._ds_api_ctx = "bp"
            return "bp"
    except Exception:
        pass
    return None


def eval_api(ctx, expr: str, timeout: float = 8.0):
    """Evaluate `expr` in the context that owns window.deckShelves."""
    which = _detect(ctx)
    if which is None:
        return None
    if which == "sjc":
        return ctx.eval_sjc(expr, timeout=timeout)
    return ctx.eval(expr, timeout=timeout)


def require_api(ctx):
    """Raise SkipTest when the public API isn't loaded (no plugin / boot)."""
    from deckprobe.uitests.lib.runner import SkipTest
    if _detect(ctx) is None:
        raise SkipTest("window.deckShelves API not present (plugin not loaded)")
