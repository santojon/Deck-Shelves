"""Modal scenarios: shelf create/edit/import/export, smart-shelf editor,
template picker, reset confirmations, game context menu.

Modals are rendered via showModal() into the Big Picture root — captures
use capture_bigpicture (landscape). The QAM is opened first so the flow
that reveals each modal is exercised, with DOM clicks running in the QAM
popup target (not SJC, which has no DS DOM).

For shelves/smart-shelf actions that live behind an ellipsis context menu,
the scenario:
  1. Clicks the [data-ds-shelf-actions] / [data-ds-smart-actions] button on
     the first row.
  2. Waits for the Decky context menu to render.
  3. Clicks the appropriate menu item by text search.

dismiss_bp_modals() is called at the start of each scenario to ensure no
stale modal from a previous scenario is visible in Big Picture."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from deckprobe.screenshots.lib.cdp import Session
from deckprobe.screenshots.lib.nav import (
    navigate_to_ds_qam, close_qam, _qam_eval,
    expand_qam_sections, dismiss_bp_modals,
    click_context_menu_edit, click_context_menu_delete,
)
from deckprobe.screenshots.lib.capture import capture_bigpicture, capture_qam
from deckprobe.screenshots.lib.registry import register


def _click_action(host: str, port: int, ok_description: str) -> bool:
    """Click a DS QAM ActionButton by its SVG icon content.

    ActionButton uses onOKActionDescription (gamepad hint), not aria-label,
    so we identify buttons by the SVG path of their icon instead.
    Icons: add=M12 5v14, import=M12 18v-6, export=M12 12v6, reset=M3 12a9.
    """
    desc = ok_description.lower()

    # Smart shelf add has the same plus icon as the regular shelf add —
    # scope the search to the smart section using data-ds-section anchor,
    # then fall back to positional check (r.top > 200 = lower half of view).
    if desc == "smart_add_shelf":
        return _qam_eval(host, port, """
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  // Primary: anchor on the smart section header.
  var hdr = document.querySelector('[data-ds-section="smart"]');
  if (hdr) {
    var container = hdr.parentElement;
    for (var i = 0; i < 8 && container; i++) {
      var btns = Array.from(container.querySelectorAll('.deck-shelves-action-btn button'));
      var addBtn = btns.find(function(b){ return b.innerHTML.indexOf('M12 5v14') !== -1; });
      if (addBtn) { addBtn.click(); return true; }
      container = container.parentElement;
    }
  }
  // Fallback: positional — plus button in lower half of viewport (legacy approach).
  var allBtns = Array.from((scope || document).querySelectorAll('button'));
  for (var b of allBtns) {
    if (b.innerHTML.indexOf('M12 5v14') !== -1 || b.innerHTML.indexOf('M5 12h14') !== -1) {
      var r = b.getBoundingClientRect();
      if (r.top > 200) { b.click(); return true; }
    }
  }
  // Last resort: second plus-icon button overall.
  var adds = allBtns.filter(function(b){ return b.innerHTML.indexOf('M12 5v14') !== -1; });
  if (adds.length >= 2) { adds[1].click(); return true; }
  if (adds.length === 1) { adds[0].click(); return true; }
  return false;
})()
""") is True

    svg_map = {
        "addshelf":             "M12 5v14",
        "import_shelves":       "M12 18v-6",
        "export_shelves":       "M12 12v6",
        "reset_shelves":        "M3 12a9",
        "reset_all":            "M3 12a9",
        "reset_all_button":     "M3 12a9",
        "import_smart_shelves": "M12 18v-6",
        "export_smart_shelves": "M12 12v6",
    }
    svg = svg_map.get(desc, "")
    if svg:
        return _qam_eval(host, port, f"""
(function(){{
  var hint = {svg!r};
  // Primary: search within action-btn containers (scoped, avoids row buttons).
  var btns = Array.from(document.querySelectorAll('.deck-shelves-action-btn button'));
  var btn = btns.find(function(b){{ return b.innerHTML.indexOf(hint) !== -1; }});
  if (btn) {{ btn.click(); return true; }}
  // Fallback: all buttons (legacy click_qam_button approach).
  var all = Array.from(document.querySelectorAll('button'));
  var fb = all.find(function(b){{ return b.innerHTML.indexOf(hint) !== -1; }});
  if (fb) {{ fb.click(); return true; }}
  return false;
}})()
""") is True

    return False


def _click_first_shelf_actions(host: str, port: int) -> str:
    """Click the ellipsis (…) button on the first regular shelf row.

    Uses [data-ds-shelf-actions] added to ShelfActionsButton in v2.0.3+.
    Falls back to the first ellipsis button inside the shelves section.
    """
    return _qam_eval(host, port, """
(function(){
  // Primary: attribute placed directly on the shelf actions DialogButton.
  var btns = Array.from(document.querySelectorAll('[data-ds-shelf-actions]'));
  if (btns.length) { btns[0].click(); return 'shelf-actions'; }
  // Fallback: legacy approach — first button whose innerHTML contains 'cx='
  // (the ellipsis SVG uses <circle cx="...">). Skip smart-shelf action buttons.
  var all = Array.from(document.querySelectorAll('button'));
  for (var b of all) {
    if (b.getAttribute('data-ds-smart-actions')) continue;
    if (b.innerHTML.indexOf('cx=') !== -1) { b.click(); return 'fallback-cx'; }
  }
  return 'not-found';
})()
""") or "no-result"


def _click_first_smart_actions(host: str, port: int) -> str:
    """Click the ellipsis (…) button on the first smart shelf row.

    Uses [data-ds-smart-actions] added to SmartShelfActionsButton in v2.0.3+.
    """
    return _qam_eval(host, port, """
(function(){
  // Primary: attribute placed directly on the smart-shelf actions DialogButton.
  var btns = Array.from(document.querySelectorAll('[data-ds-smart-actions]'));
  if (btns.length) { btns[0].click(); return 'smart-actions'; }
  // Fallback: last ellipsis button in the scope (smart shelves come after regular).
  var all = Array.from(document.querySelectorAll('button')).filter(function(b) {
    return b.innerHTML.indexOf('cx=') !== -1;
  });
  if (all.length) { all[all.length - 1].click(); return 'fallback-last-cx'; }
  return 'not-found';
})()
""") or "no-result"


@register("shelf_create")
def shelf_create(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Template picker modal opened from the QAM."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_action(host, port, "addshelf")
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-create.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-create.png": p} if p else {}


@register("shelf_import")
def shelf_import(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_action(host, port, "import_shelves")
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-import.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-import.png": p} if p else {}


@register("shelf_export")
def shelf_export(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_action(host, port, "export_shelves")
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-export.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-export.png": p} if p else {}


@register("shelf_edit")
def shelf_edit(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Shelf edit modal — opens via ellipsis context menu → Edit."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_first_shelf_actions(host, port)
    time.sleep(1.0)
    click_context_menu_edit(host, port)
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-edit.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-edit.png": p} if p else {}


@register("shelf_edit_filters")
def shelf_edit_filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_first_shelf_actions(host, port)
    time.sleep(1.0)
    click_context_menu_edit(host, port)
    time.sleep(2.0)
    from deckprobe.screenshots.lib.nav import _bp_eval
    _bp_eval(host, port, """
(function(){
  var tabs = Array.from(document.querySelectorAll('[role="tab"], [class*="tab-bar-entry"], [class*="TabBar"] .Focusable'));
  for (var t of tabs) {
    if ((t.textContent||'').toLowerCase().indexOf('filter') !== -1) { t.click(); return 'ok'; }
  }
  return 'not found';
})()
""")
    time.sleep(1.5)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-edit-filters.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-edit-filters.png": p} if p else {}


@register("shelf_edit_visual")
def shelf_edit_visual(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_first_shelf_actions(host, port)
    time.sleep(1.0)
    click_context_menu_edit(host, port)
    time.sleep(2.0)
    from deckprobe.screenshots.lib.nav import _bp_eval
    _bp_eval(host, port, """
(function(){
  var tabs = Array.from(document.querySelectorAll('[role="tab"], [class*="tab-bar-entry"], [class*="TabBar"] .Focusable'));
  for (var t of tabs) {
    if ((t.textContent||'').toLowerCase().indexOf('visual') !== -1) { t.click(); return 'ok'; }
  }
  return 'not found';
})()
""")
    time.sleep(1.5)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-edit-visual.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-edit-visual.png": p} if p else {}


@register("smart_shelf_modal")
def smart_shelf_modal(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Smart-shelf template picker (Add Smart Shelf button)."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    # Scroll to bottom so the smart section add button is visible
    _qam_eval(host, port, """
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (scope) scope.scrollTop = scope.scrollHeight;
})()
""")
    time.sleep(0.5)
    _click_action(host, port, "smart_add_shelf")
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "smart-shelf-modal.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"smart-shelf-modal.png": p} if p else {}


@register("smart_shelf_edit")
def smart_shelf_edit(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Smart-shelf editor — opens via ellipsis context menu → Edit."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    # Scroll to smart section and click its first ellipsis
    _qam_eval(host, port, """
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (!scope) return 'no-scope';
  var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  var node;
  while (node = walker.nextNode()) {
    var txt = (node.textContent || '').trim().toLowerCase();
    if (txt.indexOf('smart') !== -1 || txt.indexOf('inteligente') !== -1) {
      var el = node.parentElement;
      if (el) { el.scrollIntoView({ behavior: 'instant', block: 'center' }); return 'scrolled'; }
    }
  }
  return 'not-found';
})()
""")
    time.sleep(0.5)
    _click_first_smart_actions(host, port)
    time.sleep(1.0)
    click_context_menu_edit(host, port)
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "smart-shelf-edit.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"smart-shelf-edit.png": p} if p else {}


@register("reset_all")
def reset_all(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    # Scroll to bottom so the footer Reset All button is in view
    _qam_eval(host, port, """
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (scope) scope.scrollTop = scope.scrollHeight;
  return 'ok';
})()
""")
    time.sleep(0.5)
    # Click the LAST reset-icon button (footer Reset All, not per-section resets).
    # Uses the full SVG path from icons.tsx: M3 12a9 9 0 1 0 3-6.7
    _qam_eval(host, port, r"""
(function(){
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (!scope) return 'no-scope';
  var btns = Array.from(scope.querySelectorAll('button')).filter(function(b) {
    return b.innerHTML.indexOf('M3 12a9 9 0 1 0 3-6.7') !== -1;
  });
  if (!btns.length) return 'not-found';
  btns[btns.length - 1].click();
  return 'clicked';
})()
""")
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "reset-all.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"reset-all.png": p} if p else {}


@register("shelf_actions")
def shelf_actions(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Shelf context menu open (context menu renders in Big Picture DOM)."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_first_shelf_actions(host, port)
    time.sleep(1.0)
    # Capture with QAM still open (context menu stays in BP DOM).
    out = out_dir / "shelf-actions.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    close_qam(sjc)
    return {"shelf-actions.png": p} if p else {}


@register("shelf_hidden")
def shelf_hidden(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM showing a hidden shelf row. Stays on the QAM popup (portrait)."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _qam_eval(host, port, """
(function(){
  const row = document.querySelector('[data-ds-shelf-row][data-ds-shelf-hidden="true"], .deck-shelves-shelf-list [data-ds-shelf-row]');
  if (row) row.scrollIntoView({block:'center'});
  return 'ok';
})()
""")
    time.sleep(0.5)
    out = out_dir / "shelf-hidden.png"
    p = capture_qam(host, port, out)
    close_qam(sjc)
    return {"shelf-hidden.png": p} if p else {}


@register("shelf_delete")
def shelf_delete(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Shelf delete confirmation modal — opens via ellipsis context menu → Delete."""
    navigate_to_ds_qam(sjc, host, port)
    expand_qam_sections(host, port)
    _click_first_shelf_actions(host, port)
    time.sleep(1.0)
    click_context_menu_delete(host, port)
    time.sleep(2.0)
    close_qam(sjc, settle_ms=600)
    out = out_dir / "shelf-delete.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    return {"shelf-delete.png": p} if p else {}


@register("game_menu")
def game_menu(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Game context menu triggered from a DS card on the home screen."""
    dismiss_bp_modals(host, port)
    from deckprobe.screenshots.lib.nav import _bp_eval
    # Wait for a card with an appid to be present (up to 10s)
    deadline = time.time() + 10.0
    while time.time() < deadline:
        found = _bp_eval(host, port, "!!document.querySelector('.ds-card[data-appid]')")
        if found:
            break
        time.sleep(1.0)
    # Use vgp_onmenubutton — same event the legacy script uses to open the game context menu.
    _bp_eval(host, port, """
(function(){
  const card = document.querySelector('.ds-card[data-appid]');
  if (!card) return 'no card';
  card.dispatchEvent(new Event('vgp_onmenubutton', { bubbles: true }));
  return 'ok';
})()
""")
    time.sleep(2.5)
    out = out_dir / "game-menu.png"
    p = capture_bigpicture(host, port, out)
    dismiss_bp_modals(host, port)
    time.sleep(0.5)
    return {"game-menu.png": p} if p else {}
