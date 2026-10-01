"""Content-script video scenarios — 5 feature-highlight recordings for the
public content-script table (ECOSYSTEM.md §5, scripts 1/2/6/3/4, in that
priority order). Requires the video fixture deployed first
(`pnpm run qa:video-fixture`): every shelf/smart-shelf/profile id referenced
below only exists under that fixture, never in a real install's own settings.

Each scenario DRIVES a real, live interaction (not just a static shelf view)
then navigates home to show the result — reusing this project's own
verified-live UI-automation patterns from `scripts/deckprobe-ext/uitests/`:
  - Route navigation via `nav.navigate()` (`SteamUIStore...GamepadUIMainWindowInstance.Navigate`)
    — the CURRENT working mechanism. The older `DFL?.Navigation` pattern in
    some existing uitests suites (profiles.py, edit_shelf_modal.py,
    settings_page.py) no longer resolves on a recent Steam client build
    (confirmed live while building this file — `DFL` is undefined in
    SharedJSContext); those suites need the same fix separately.
  - Text-field typing via the native input value setter + a real `input`
    event (profiles.py's proven pattern for a React-controlled `<input>`).
  - `[class*=Primary]` for a modal's Save/OK action, its very next sibling
    for Cancel — the ConfirmModal convention used everywhere in this project.
  - `[role=checkbox]` + `aria-checked` for ToggleField state — locale-independent,
    verified live against EditShelfModal's Visual tab.

SAFETY: every scenario below can trigger a real Save click. This must only
ever run against a build with DS_QA_VIDEO_FIXTURE=1 (or another exclusive QA
fixture) active — `saveSettings` no-ops for the real backend under any QA
override (see harness.tsx's `qaOverrideActive` doc comment). `_require_qa_fixture`
aborts the whole scenario file with no clicks at all if that tag is missing,
so a bundle without the fixture can never let a Save reach a real settings file.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict, Optional

from deckprobe.screenshots.lib.cdp import Session, open_session
from deckprobe.screenshots.lib.nav import navigate_home, navigate_settings, navigate, _bp_eval
from deckprobe.videos.lib.registry import register
from deckprobe.videos.lib.capture import record
from ._locale import force_locale

_MODAL_SEL = "[class*=GenericConfirmDialog]"


def _qa_tagged(host: str, port: int) -> bool:
    return _bp_eval(host, port, """
(function(){
  try {
    const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
    return !!(raw && JSON.parse(raw).__dsQaOverride === true);
  } catch(e) { return false; }
})()
""") is True


def _await_qa_tagged(host: str, port: int, timeout_s: float = 8.0) -> bool:
    """Poll for the fixture tag rather than a single snapshot check — right
    after a fresh bundle injection the settings cache can take a beat to
    settle (observed live: the first scenario in a run seeing no fixture
    data at all, while a later one in the same run sees it fine)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _qa_tagged(host, port):
            return True
        time.sleep(0.4)
    return False


def _require_qa_fixture(host: str, port: int) -> None:
    """Hard stop — never let any scenario below click a real Save unless the
    QA video fixture is confirmed active in the live session right now."""
    if not _await_qa_tagged(host, port):
        raise RuntimeError(
            "DS_QA_VIDEO_FIXTURE fixture not detected (__dsQaOverride missing) — "
            "refusing to run: these scenarios click a real Save button, which "
            "would persist to the actual settings file without the fixture's "
            "no-op-save guard active."
        )


def _shelf_id(host: str, port: int, key: str, fixture_id: str, timeout_s: float = 8.0) -> Optional[str]:
    """Resolve a fixture shelf/smart-shelf id, polling rather than a single
    snapshot check (same settle-time reasoning as `_await_qa_tagged`).
    Returns None (never a hardcoded id blindly) so a scenario can skip
    cleanly instead of editing whatever happens to be first in a real,
    non-fixture list."""
    deadline = time.time() + timeout_s
    expr = f"""
(function(){{
  try {{
    const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
    const s = JSON.parse(raw);
    const list = s.{key} || [];
    return list.some(x => x.id === {fixture_id!r});
  }} catch(e) {{ return false; }}
}})()
"""
    found = False
    while time.time() < deadline:
        found = _bp_eval(host, port, expr)
        if found is True:
            break
        time.sleep(0.4)
    return fixture_id if found is True else None


def _navigate_edit_route(host: str, port: int, shelf_id: str, settle_ms: int = 2500) -> None:
    """Opens a FRESH SharedJSContext connection for this one Navigate call,
    instead of reusing the long-lived `sjc` the run loop hands every
    scenario. Working hypothesis for the earlier 1-2s stub recordings: this
    exact call reliably opened the modal in a short-lived manual probe, but
    the SAME `sjc` object, already reused across several prior scenarios'
    worth of eval traffic, may silently no-op (navigate()'s own try/except
    swallows any failure) — never confirmed live, but a fresh connection
    per call is a safe defensive fix either way."""
    fresh = open_session(host, port, "SharedJSContext")
    try:
        navigate(fresh, f"/deck-shelves/edit/{shelf_id}", settle_ms=settle_ms)
    finally:
        fresh.close()


def _await_modal(host: str, port: int, timeout_s: float = 10.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _bp_eval(host, port, f"!!document.querySelector({_MODAL_SEL!r})") is True:
            return True
        time.sleep(0.3)
    return False


def _await_modal_closed(host: str, port: int, timeout_s: float = 4.0) -> bool:
    """Poll for the modal to actually disappear after a Save click, rather
    than a fixed sleep — observed live (visual_customization, Now Playing/
    Visual tab): the Save click can register (button found, no error) yet
    the modal stays open a beat longer than the fixed 1.2s the caller used
    to just assume, leaving it stuck open into whatever runs next."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if _bp_eval(host, port, f"!!document.querySelector({_MODAL_SEL!r})") is not True:
            return True
        time.sleep(0.3)
    return False


def _click_tab(host: str, port: int, index: int) -> bool:
    return _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const tabs = modal ? Array.from(modal.querySelectorAll('[role=tab]')) : [];
  if (tabs.length <= {index}) return false;
  tabs[{index}].click();
  return true;
}})()
""") is True


def _set_title(host: str, port: int, title: str) -> bool:
    """Types into the modal's title text field — native setter + a real
    `input` event, same as profiles.py's proven new-profile-name pattern."""
    return _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const inputs = modal ? Array.from(modal.querySelectorAll('input[type=text], input:not([type])')) : [];
  if (!inputs.length) return false;
  const input = inputs[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, {title!r});
  input.dispatchEvent(new Event('input', {{ bubbles: true }}));
  return true;
}})()
""") is True


def _click_checkbox(host: str, port: int, index: int) -> bool:
    return _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const checks = modal ? Array.from(modal.querySelectorAll('[role=checkbox]')) : [];
  if (checks.length <= {index}) return false;
  checks[{index}].click();
  return true;
}})()
""") is True


def _click_nth_button(host: str, port: int, index: int) -> bool:
    return _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const buttons = modal ? Array.from(modal.querySelectorAll('button, [role=button]')) : [];
  if (buttons.length <= {index}) return false;
  buttons[{index}].click();
  return true;
}})()
""") is True


def _select_dropdown_option(host: str, port: int, text_prefix: str) -> bool:
    """Picks a real option from a floating SteamUI Dropdown popup (portal-mounted
    outside the modal, as `.BasicUIContextMenu [role=option]`) by its visible
    text — confirmed live: a plain `.click()` on the option both selects it AND
    closes the popup. Without this, a scenario that only opens the dropdown
    (`_click_nth_button`) leaves it open as a floating overlay that survives
    Save/navigate-home and bleeds into every scenario that runs after it."""
    return _bp_eval(host, port, f"""
(function(){{
  const opts = Array.from(document.querySelectorAll('.BasicUIContextMenu [role=option]'));
  const target = opts.find(o => (o.textContent || '').trim().startsWith({text_prefix!r}));
  if (!target) return false;
  target.click();
  return true;
}})()
""") is True


def _save_modal(host: str, port: int) -> bool:
    return _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const btn = modal?.querySelector('[class*=Primary]');
  if (!btn) return false;
  btn.click();
  return true;
}})()
""") is True


def _cancel_modal(host: str, port: int) -> None:
    _bp_eval(host, port, f"""
(function(){{
  const modal = document.querySelector({_MODAL_SEL!r});
  const saveBtn = modal?.querySelector('[class*=Primary]');
  const cancelBtn = saveBtn ? saveBtn.nextElementSibling : null;
  (cancelBtn || saveBtn)?.click();
}})()
""")


def _sweep_stray_modals(host: str, port: int, tries: int = 4) -> None:
    """Dismiss any modal already open before a scenario's own navigation —
    same insurance edit_shelf_modal.py/profiles.py already use, but here it
    also specifically covers the first-run ShowcaseModal (a plain
    ConfirmModal, same [class*=GenericConfirmDialog] shape, Skip = the
    Cancel-position sibling): a settings reload race can surface it even
    with showcaseSeen forced true in the fixture (see harness.tsx), since
    the race shows the PRE-load default settings, before the fixture (or
    any real data) has applied at all. Also clears a floating SteamUI
    Dropdown popup (`.BasicUIContextMenu`, portal-mounted outside any modal)
    left open by a prior scenario's own dropdown action — confirmed live
    that this exact popup survives Save + navigate-home and otherwise bleeds
    into whatever scenario runs next."""
    for _ in range(tries):
        _bp_eval(host, port, """
(function(){
  const menu = document.querySelector('.BasicUIContextMenu');
  if (menu) menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
})()
""")
        if _bp_eval(host, port, f"!!document.querySelector({_MODAL_SEL!r})") is not True:
            return
        _cancel_modal(host, port)
        time.sleep(0.6)


def _await_shelf(host: str, port: int, shelf_id: str, timeout_s: float = 6.0) -> bool:
    deadline = time.time() + timeout_s
    selector = f'.ds-shelf[data-shelfid="{shelf_id}"]'
    while time.time() < deadline:
        if _bp_eval(host, port, f"!!document.querySelector('{selector}')") is True:
            return True
        time.sleep(0.3)
    return False


def _focus_shelf(host: str, port: int, shelf_id: str) -> None:
    _bp_eval(host, port, f"""
(function(){{
  const shelf = document.querySelector('.ds-shelf[data-shelfid="{shelf_id}"]');
  if (!shelf) return 'no-shelf';
  const mount = document.getElementById('deck-shelves-home-root');
  let scr = mount ? mount.parentElement : null;
  while (scr) {{
    try {{
      const cs = getComputedStyle(scr);
      const oy = (cs.overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scr.scrollHeight > scr.clientHeight) break;
    }} catch(_){{}}
    scr = scr.parentElement;
  }}
  if (scr) {{
    const shelfRect = shelf.getBoundingClientRect();
    const scrRect = scr.getBoundingClientRect();
    scr.scrollTop = Math.max(0, Math.round(scr.scrollTop + (shelfRect.top - scrRect.top) - 200));
  }}
  const card = shelf.querySelector('.ds-card');
  if (card) try {{ card.focus(); }} catch(_){{}}
  return 'ok';
}})()
""")


def _edit_flow(
    sjc: Session, host: str, port: int, out_dir: Path, name: str,
    shelf_key: str, fixture_id: str, tab_index: int, action, *,
    show_result_shelf_id: Optional[str] = None,
) -> Dict[str, Path]:
    """Shared shape for scripts 1/2/3/4: open the fixture shelf's editor,
    switch to `tab_index`, run `action(host, port)` (the one live edit this
    scenario demonstrates), Save, then show the change on Home. Recording
    spans both halves — the edit AND the result — per the request that this
    show the flow, not only the outcome."""
    _require_qa_fixture(host, port)
    force_locale(sjc)
    _sweep_stray_modals(host, port)
    sid = _shelf_id(host, port, shelf_key, fixture_id)
    if not sid:
        return {}
    with record(host, port, "Big Picture", out_dir, name):
        _navigate_edit_route(host, port, sid, settle_ms=2500)
        _sweep_stray_modals(host, port)  # e.g. the first-run tour, if a reload raced it in
        if not _await_modal(host, port):
            _navigate_edit_route(host, port, sid, settle_ms=2000)  # one retry
            if not _await_modal(host, port):
                return {}
        time.sleep(0.8)
        if tab_index > 0:
            _click_tab(host, port, tab_index)
            time.sleep(0.8)
        action(host, port)
        time.sleep(1.0)
        if not _save_modal(host, port):
            _cancel_modal(host, port)
            return {}
        if not _await_modal_closed(host, port):
            _cancel_modal(host, port)  # already saved (notify() is synchronous); this only dismisses the leftover UI
        time.sleep(0.5)
        navigate_home(sjc, settle_ms=2000)
        _sweep_stray_modals(host, port)  # same race can surface it here too
        result_id = show_result_shelf_id or sid
        if _await_shelf(host, port, result_id, timeout_s=5.0):
            _focus_shelf(host, port, result_id)
        time.sleep(3.0)
    out = out_dir / name
    return {name: out} if out.exists() else {}


@register("custom_shelves")
def custom_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Script 1 — "Your Steam Deck home, your rules." Renames the My Library
    shelf live (Source tab, title field) and shows the new name on Home."""
    return _edit_flow(
        sjc, host, port, out_dir, "01-custom-shelves.mp4",
        "shelves", "vid_favorites", tab_index=0,
        action=lambda h, p: _set_title(h, p, "My Games"),
    )


@register("smart_shelves")
def smart_shelves(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Script 2 — "Shelves that fill themselves." Renames the Quick Play
    smart shelf live, then shows it still fills itself under the new name."""
    return _edit_flow(
        sjc, host, port, out_dir, "02-smart-shelves.mp4",
        "smartShelves", "vid_sm_quick", tab_index=0,
        action=lambda h, p: _set_title(h, p, "Jump Back In"),
    )


@register("filters")
def filters(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Script 3 — "Only the games you want, on the shelf you want." Most
    Played: flips the filter group's match mode (all -> any of the two
    stacked conditions) live on the Filters tab, then shows the shelf's
    result set actually change on Home.

    The mode-toggle button's position (index 1 among the tab's own buttons,
    after the "save current as a saved filter" quick action) was confirmed
    live against a shelf with a populated filterGroup + saved-filters bar —
    same layout the fixture's shelf renders, but re-verify if this drifts.
    The button only opens a floating popup (a SteamUI Dropdown, portal-mounted
    outside the modal) — the actual flip is picking "Any must match" from it,
    which also closes the popup; leaving it open bled into every scenario
    that ran after this one (confirmed live)."""
    def _flip_mode(h: str, p: int) -> bool:
        if not _click_nth_button(h, p, 1):
            return False
        time.sleep(0.6)
        return _select_dropdown_option(h, p, "Any must match")

    return _edit_flow(
        sjc, host, port, out_dir, "03-filters.mp4",
        "shelves", "vid_acclaimed", tab_index=1,
        action=_flip_mode,
    )


@register("visual_customization")
def visual_customization(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Script 4 — "Make it look like a store page, not a list." Now Playing:
    turns on hero art live (Visual tab, checkbox index 4 — confirmed live:
    "Ativar hero art" / Enable hero art), then shows it painted on Home."""
    return _edit_flow(
        sjc, host, port, out_dir, "04-visual-customization.mp4",
        "shelves", "vid_now_playing", tab_index=2,
        action=lambda h, p: _click_checkbox(h, p, 4),
    )


@register("profiles_triggers")
def profiles_triggers(sjc: Session, host: str, port: int, out_dir: Path) -> Dict[str, Path]:
    """Script 6 — "Your home changes itself when you dock, unplug, or it's
    late." Creates a new profile live, sets a charging trigger, saves, then
    shows the profile row (with the effect it applies — hidden Recents) on
    the Settings > Profiles tab. Reuses uitests/suites/profiles.py's own
    verified-live flow (its `ctx.eval` calls translated to `_bp_eval`).
    Never touches the fixture's own "Docked" profile — creates and leaves a
    second one, same non-destructive convention as that suite."""
    _require_qa_fixture(host, port)
    force_locale(sjc)
    _sweep_stray_modals(host, port)
    name = "06-profiles-triggers.mp4"
    profile_name = "Video Demo — Charging Trigger"
    page_sel = ".deck-shelves-settings-page"
    row_sel = '[style*="border-radius: 6px"]'

    def _rows_expr() -> str:
        return f"Array.from(document.querySelector({page_sel!r})?.querySelectorAll({row_sel!r}) || [])"

    with record(host, port, "Big Picture", out_dir, name):
        navigate_settings(sjc, settle_ms=2500)
        landed = _bp_eval(host, port, f"!!document.querySelector({page_sel!r})")
        if landed is not True:
            return {}
        clicked_tab = _bp_eval(host, port, f"""
(function(){{
  const page = document.querySelector({page_sel!r});
  const tabs = Array.from(page.querySelectorAll('[role=tab]'));
  if (tabs.length < 2) return false;
  tabs[1].click();
  return true;
}})()
""")
        if clicked_tab is not True:
            return {}
        time.sleep(0.8)

        created = _bp_eval(host, port, f"""
(function(){{
  const page = document.querySelector({page_sel!r});
  const inputs = Array.from(page.querySelectorAll('input[type=text], input:not([type])'));
  if (!inputs.length) return false;
  const input = inputs[inputs.length - 1];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, {profile_name!r});
  input.dispatchEvent(new Event('input', {{ bubbles: true }}));
  const row = input.closest('[style*="display: flex"]') || input.parentElement.parentElement;
  const saveBtn = row.querySelector('button, [role=button]');
  if (!saveBtn || saveBtn.disabled) return false;
  saveBtn.click();
  return true;
}})()
""")
        if created is not True:
            return {}
        time.sleep(1.5)

        opened_trigger = _bp_eval(host, port, f"""
(function(){{
  const rows = {_rows_expr()};
  const row = rows[rows.length - 1];
  if (!row) return false;
  const buttons = Array.from(row.querySelectorAll('button, [role=button], [tabindex]'));
  if (buttons.length < 2) return false;
  buttons[1].click();
  return true;
}})()
""")
        if opened_trigger is True:
            time.sleep(1.2)
            # Power category is the 3rd collapsible box; Charging is its 2nd
            # invertible option (header, Battery-add, Charging, Charging-not)
            # — same catalog position uitests/suites/profiles.py verified.
            _bp_eval(host, port, """
(async function(){
  const getPowerBox = () => {
    const modal = Array.from(document.querySelectorAll('[class*=GenericConfirmDialog]')).pop();
    const boxes = modal ? Array.from(modal.querySelectorAll('.ds-collapsible-box')) : [];
    return boxes[2] || null;
  };
  const isOpen = (box) => !!box && box.innerText.includes('\\u25B2');
  let clicked = 0;
  const deadline = Date.now() + 6000;  // _bp_eval's CDP call itself times out at 8s
  while (Date.now() < deadline) {
    const box = getPowerBox();
    if (isOpen(box)) {
      const buttons = Array.from(box.querySelectorAll('button, [role=button]'));
      if (buttons.length > 2) { buttons[2].click(); return true; }
    } else if (clicked === 0 && box) {
      box.querySelector('.ds-collapsible-header')?.click();
      clicked += 1;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
})()
""")
            time.sleep(0.8)
            _bp_eval(host, port, """
(function(){
  const modal = Array.from(document.querySelectorAll('[class*=GenericConfirmDialog]')).pop();
  const btn = modal?.querySelector('[class*=Primary]');
  if (btn) { btn.click(); return true; }
  return false;
})()
""")
            time.sleep(1.5)

        # Show the result: the new profile's row, trigger configured.
        time.sleep(2.5)
    out = out_dir / name
    return {name: out} if out.exists() else {}
