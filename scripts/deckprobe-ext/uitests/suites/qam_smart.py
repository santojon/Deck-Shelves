"""QAM smart shelves section — verified via Decky plugin list presence."""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite
# `_qam_shared` is a sibling underscore-prefixed module loaded via the
# suites-dir entry the runner adds to sys.path. The runner skips
# underscore-prefixed files when scanning for suites, so this stays a
# pure helper module.
from _qam_shared import _require_qam, _ds_in_plugin_list, _DECKY_PANEL

s = suite("qam_smart")


@s.test("Smart shelves section header present")
def _(ctx) -> None:
    """DS plugin in Decky list = smart shelves feature is available in QAM."""
    _require_qam(ctx)
    found = _ds_in_plugin_list(ctx)
    ctx.close_qam()
    assert found is True, "Deck Shelves (with smart shelves) not in Decky QAM"


@s.test("Smart shelves toggle is operable")
def _(ctx) -> None:
    """Decky plugin list has interactive buttons (DS entry is clickable)."""
    _require_qam(ctx)
    has_button = ctx.eval_qam(f"""
(function(){{
    var p = document.getElementById("{_DECKY_PANEL}");
    var btns = Array.from(p?.querySelectorAll("button") || []);
    var ds = btns.find(b => (b.textContent||"").trim() === "Deck Shelves");
    return !!(ds && !ds.disabled);
}})()""") is True
    ctx.close_qam()
    assert has_button is True, "Deck Shelves button is not interactive in QAM"
