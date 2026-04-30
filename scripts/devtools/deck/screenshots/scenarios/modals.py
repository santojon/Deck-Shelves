"""Modal scenarios: shelf create/edit/import/export, smart-shelf editor,
template picker, reset confirmations, game context menu.

These modals are rendered via the host's `showModal(...)`, which mounts
them at the Big Picture root — captures use `capture_bigpicture` so the
resulting PNG is landscape-shaped (matching the validator's expectation
for files without an explicit `surface: 'qam-popup'` entry). The QAM
popup is opened first so the user-flow that reveals the modal is
exercised, but the capture itself is taken from the BP target where the
modal portal actually paints.

Captures kept on the QAM popup (portrait): the QAM-list states that
don't open a modal, e.g. `shelf-hidden`."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict

from ..lib.cdp import Session
from ..lib.nav import open_qam, close_qam
from ..lib.capture import capture_bigpicture, capture_qam
from ._registry import register


def _click_action(sjc: Session, ok_description: str) -> bool:
    """Click a QAM ActionButton by its `onOKActionDescription` text."""
    return sjc.evaluate(f"""
(function(){{
  const btns = document.querySelectorAll('button[aria-label]');
  for (const b of btns) {{
    if ((b.getAttribute('aria-label') || '').toLowerCase() === {ok_description.lower()!r}) {{
      b.click();
      return true;
    }}
  }}
  // Fallback: scan ActionButton wrappers and find the one whose tooltip
  // text matches.
  const wraps = document.querySelectorAll('.deck-shelves-action-btn');
  for (const w of wraps) {{
    const t = (w.textContent || '').toLowerCase();
    if (t.includes({ok_description.lower()!r})) {{
      const inner = w.querySelector('button');
      if (inner) {{ inner.click(); return true; }}
    }}
  }}
  return false;
}})()
""") is True


@register("shelf_create")
def shelf_create(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Template picker modal opened from the QAM."""
    open_qam(sjc, settle_ms=1500)
    _click_action(sjc, "addshelf")
    time.sleep(1.2)
    out = out_dir / "shelf-create.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-create.png": p} if p else {}


@register("shelf_import")
def shelf_import(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    _click_action(sjc, "import_shelves")
    time.sleep(1.0)
    out = out_dir / "shelf-import.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-import.png": p} if p else {}


@register("shelf_export")
def shelf_export(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    _click_action(sjc, "export_shelves")
    time.sleep(1.0)
    out = out_dir / "shelf-export.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-export.png": p} if p else {}


@register("shelf_edit")
def shelf_edit(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const editBtn = document.querySelector('[data-ds-action="edit"]');
  if (editBtn) { editBtn.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(1.5)
    out = out_dir / "shelf-edit.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-edit.png": p} if p else {}


@register("shelf_edit_filters")
def shelf_edit_filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const editBtn = document.querySelector('[data-ds-action="edit"]');
  if (editBtn) { editBtn.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(1.0)
    sjc.evaluate("""
(function(){
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const t of tabs) {
    if ((t.textContent||'').toLowerCase().includes('filter')) { t.click(); return 'ok'; }
  }
  return 'not found';
})()
""")
    time.sleep(0.8)
    out = out_dir / "shelf-edit-filters.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-edit-filters.png": p} if p else {}


@register("shelf_edit_visual")
def shelf_edit_visual(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const editBtn = document.querySelector('[data-ds-action="edit"]');
  if (editBtn) { editBtn.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(1.0)
    sjc.evaluate("""
(function(){
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const t of tabs) {
    if ((t.textContent||'').toLowerCase().includes('visual')) { t.click(); return 'ok'; }
  }
  return 'not found';
})()
""")
    time.sleep(0.8)
    out = out_dir / "shelf-edit-visual.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-edit-visual.png": p} if p else {}


@register("smart_shelf_modal")
def smart_shelf_modal(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Smart-shelf template picker."""
    open_qam(sjc, settle_ms=1500)
    _click_action(sjc, "smart_add_shelf")
    time.sleep(1.2)
    out = out_dir / "smart-shelf-modal.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"smart-shelf-modal.png": p} if p else {}


@register("smart_shelf_edit")
def smart_shelf_edit(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Smart-shelf editor with the new Smart filters tab."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const editBtn = document.querySelector('[data-ds-smart-action="edit"]');
  if (editBtn) { editBtn.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(1.2)
    out = out_dir / "smart-shelf-edit.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"smart-shelf-edit.png": p} if p else {}


@register("reset_all")
def reset_all(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    open_qam(sjc, settle_ms=1500)
    _click_action(sjc, "reset_all")
    time.sleep(1.0)
    out = out_dir / "reset-all.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"reset-all.png": p} if p else {}


@register("shelf_actions")
def shelf_actions(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM with the per-shelf actions menu open."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const menu = document.querySelector('[data-ds-action="more"]');
  if (menu) { menu.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(0.7)
    out = out_dir / "shelf-actions.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-actions.png": p} if p else {}


@register("shelf_hidden")
def shelf_hidden(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """QAM showing a hidden shelf row (eye-slash icon). This stays on the
    QAM popup target (portrait) — no modal is opened."""
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const row = document.querySelector('[data-ds-shelf-hidden="true"]');
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
    open_qam(sjc, settle_ms=1500)
    sjc.evaluate("""
(function(){
  const del = document.querySelector('[data-ds-action="delete"]');
  if (del) { del.click(); return 'ok'; }
  return 'not found';
})()
""")
    time.sleep(0.8)
    out = out_dir / "shelf-delete.png"
    p = capture_bigpicture(host, port, out)
    close_qam(sjc)
    return {"shelf-delete.png": p} if p else {}


@register("game_menu")
def game_menu(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Game context menu (MENU button overlay)."""
    sjc.evaluate("""
(function(){
  const card = document.querySelector('.ds-card');
  if (!card) return 'no card';
  const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  card.dispatchEvent(evt);
  return 'ok';
})()
""")
    time.sleep(1.2)
    out = out_dir / "game-menu.png"
    p = capture_bigpicture(host, port, out)
    return {"game-menu.png": p} if p else {}
