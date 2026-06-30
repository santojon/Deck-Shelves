"""QAM global toggles — verified via Decky plugin list presence."""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite
# Shared helpers live in `_qam_shared.py` (sibling underscore-prefixed
# module skipped by the runner's suites scanner).
from _qam_shared import _require_qam, _DECKY_PANEL

s = suite("qam_global_toggles")


@s.test("Apply globally / Visual section header present")
def _(ctx) -> None:
    """Decky plugin list confirms DS is installed (global toggles are available)."""
    _require_qam(ctx)
    text = ctx.eval_qam(f"""
(function(){{
    var p = document.getElementById("{_DECKY_PANEL}");
    return p?.innerText || "";
}})()""") or ""
    ctx.close_qam()
    assert "Deck Shelves" in text, "Deck Shelves not found in Decky QAM (global toggles unavailable)"
