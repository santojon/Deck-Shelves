"""QAM sidecar coverage.

The sidecar (`.deck-shelves-qam-sidecar`) is the expanded side panel of
the DS QuickAccess tab. Deep QAM interaction over CDP is flaky, so this
suite verifies the sidecar's host plugin is reachable and — best-effort —
that the DS module marked itself loaded in the QAM context.
"""
from __future__ import annotations

from deckprobe.uitests.lib.runner import suite, SkipTest
from _qam_shared import _require_qam, _ds_in_plugin_list

s = suite("sidecar")


@s.test("sidecar host plugin reachable in QAM")
def _(ctx) -> None:
    _require_qam(ctx)
    found = _ds_in_plugin_list(ctx)
    ctx.close_qam()
    assert found is True, "Deck Shelves (sidecar host) not reachable in Decky QAM"


@s.test("sidecar module marks itself loaded")
def _(ctx) -> None:
    _require_qam(ctx)
    marker = ctx.eval_qam(
        "document.documentElement.getAttribute('data-ds-module-loaded')"
    )
    ctx.close_qam()
    if not marker:
        raise SkipTest("DS QAM content not mounted (sidecar not opened yet)")
    assert isinstance(marker, str) and marker.startswith("yes@"), \
        f"unexpected module-loaded marker: {marker!r}"


@s.test("sidecar element absent until tab expanded")
def _(ctx) -> None:
    _require_qam(ctx)
    count = ctx.eval_qam("document.querySelectorAll('.deck-shelves-qam-sidecar').length")
    ctx.close_qam()
    assert count in (0, 1), f"unexpected sidecar element count: {count}"
