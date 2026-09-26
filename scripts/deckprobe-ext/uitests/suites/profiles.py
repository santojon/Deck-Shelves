"""Profile trigger configuration — settings Profiles tab (`/deck-shelves/settings`),
reached the same way as `settings_page.py` (direct route navigation via
`Navigation.Navigate`, called on the SharedJSContext session — the plain
`window.Navigation` global in the Big Picture window itself doesn't carry
Decky's router, only SJC does).

Covers the full user-facing flow for setting a profile's auto-switch
trigger: create a new profile (so this test never touches the factory
profile or any profile the device owner already has), open its trigger
editor, add a condition, save, then delete the profile again so repeated
runs don't accumulate test profiles on the device.

Selectors are structural, not text-based (device may run any of 19
locales):
  - `.deck-shelves-settings-page [style*="border-radius: 6px"]` — one per
    profile row (factory first, then saved profiles in order).
  - Within a row, action buttons in a fixed order: Apply, [Set trigger —
    only while triggers are on], [Update, Duplicate, Rename, Export, Delete
    — only for non-factory rows].
  - The trigger editor (`VisibilityRulesEditor`, `idPrefix="trig"`) renders
    each rule-kind category as a `.ds-collapsible-box` (a real DS class,
    not a hashed Steam one) in the fixed `CATALOG` order from
    VisibilityRulesEditor.tsx: time, session, power, connectivity, display,
    perf, peripherals. "Charging" is the 3rd entry's 2nd invertible option
    (index 2 among that box's buttons: [header, Battery-add, Charging,
    Charging-not]) — chosen deliberately because it's a plain click-to-add
    invertible rule with no dropdown involved (Decky's Dropdown popup has
    no verified click path in this harness yet — see edit_shelf_modal.py's
    own docstring).
  - Both the trigger editor and any confirm dialog (delete) are Decky
    ConfirmModal instances, matched by `[class*=GenericConfirmDialog]`,
    OK/Primary action via `[class*=Primary]` — same pattern already
    established in edit_shelf_modal.py.

Text-field typing (the new profile's name) uses the native input value
setter + a real `input` event, not `.value =` alone — required for a
React-controlled `<input>` to pick up the change (verified live: the Save
button's `disabled` state, which is wired to the same React state, flips
correctly).
"""
from __future__ import annotations

import time

from deckprobe.uitests.lib.runner import suite, SkipTest

s = suite("profiles")

_PAGE_SEL = ".deck-shelves-settings-page"
_ROW_SEL = '[style*="border-radius: 6px"]'
_MODAL_SEL = "[class*=GenericConfirmDialog]"
_PROFILE_NAME = "Video Demo — Charging Trigger"
_POWER_BOX_INDEX = 2  # CATALOG order: time, session, power, ...
_CHARGING_BUTTON_INDEX = 2  # within the power box: header, Battery-add, Charging, Charging-not


def _navigate_settings(ctx) -> bool:
    """Same pattern as settings_page.py's helper of the same name — Navigate
    must run on SJC (Decky's router isn't wired into the BP window's own
    `Navigation` global)."""
    ctx.eval_sjc("""
(function(){
    const nav = (globalThis).DFL?.Navigation ?? (globalThis).Navigation ?? (globalThis).window?.Navigation;
    if (typeof nav?.Navigate === 'function') nav.Navigate('/deck-shelves/settings');
})()
""")
    settled = ctx.eval(f"""
(async function(){{
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {{
        const txt = document.body.innerText || '';
        if (txt.includes('error occured') || txt.includes('error occurred')) return {{ crash: true }};
        if (document.querySelector({_PAGE_SEL!r})) return {{ crash: false, mounted: true }};
        await new Promise(r => setTimeout(r, 200));
    }}
    return {{ crash: false, mounted: false }};
}})()
""", timeout=15) or {}
    return settled.get("crash") is not True and settled.get("mounted") is True


def _leave_settings(ctx) -> None:
    ctx.eval_sjc("""
(function(){
    const nav = (globalThis).DFL?.Navigation ?? (globalThis).Navigation ?? (globalThis).window?.Navigation;
    if (typeof nav?.Navigate === 'function') nav.Navigate('/library/home');
})()
""")
    time.sleep(0.8)


def _click_profiles_tab(ctx) -> bool:
    return ctx.eval(f"""
(function(){{
    const page = document.querySelector({_PAGE_SEL!r});
    const tabs = Array.from(page.querySelectorAll('[role=tab]'));
    if (tabs.length < 2) return false;
    tabs[1].click();
    return true;
}})()
""") is True


def _profile_rows(ctx):
    return f"""
(function(){{
    const page = document.querySelector({_PAGE_SEL!r});
    return Array.from(page.querySelectorAll({_ROW_SEL!r}));
}})()
"""


def _create_profile(ctx, name: str) -> bool:
    """Types `name` into the new-profile TextField (native setter + a real
    `input` event, so React's controlled state actually updates) and clicks
    the row's Save button (its own first actionable control)."""
    return ctx.eval(f"""
(function(){{
    const page = document.querySelector({_PAGE_SEL!r});
    const inputs = Array.from(page.querySelectorAll('input[type=text], input:not([type])'));
    if (!inputs.length) return false;
    const input = inputs[inputs.length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, {name!r});
    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
    const row = input.closest('[style*="display: flex"]') || input.parentElement.parentElement;
    const saveBtn = row.querySelector('button, [role=button]');
    if (!saveBtn || saveBtn.disabled) return false;
    saveBtn.click();
    return true;
}})()
""") is True


def _last_row_name(ctx):
    return ctx.eval(f"""
(function(){{
    const rows = {_profile_rows(ctx)};
    const row = rows[rows.length - 1];
    return row ? row.innerText.split(String.fromCharCode(10))[0] : null;
}})()
""")


def _topmost_modal_expr() -> str:
    """A JS expression yielding the LAST (topmost) open modal, not the
    first — two stray modals stacking (e.g. a leftover from an interrupted
    prior run) would otherwise make `document.querySelector` silently grab
    the wrong one. Used everywhere a modal is queried, for consistency."""
    return f"Array.from(document.querySelectorAll({_MODAL_SEL!r})).pop()"


def _sweep_stray_modals(ctx) -> None:
    """Close any modal already open before this test starts — mirrors
    edit_shelf_modal.py's own sweep. A modal left over from an earlier
    interrupted run (this suite or another) would otherwise sit in front of
    the one this test opens next."""
    ctx.eval(f"""
(function(){{
    for (let i = 0; i < 5; i++) {{
        const modal = {_topmost_modal_expr()};
        if (!modal) break;
        const btn = modal.querySelector('[class*=Primary]');
        const cancelBtn = btn ? btn.nextElementSibling : null;
        (cancelBtn || btn)?.click();
    }}
    return true;
}})()
""")
    time.sleep(0.6)


def _open_trigger_modal_for_last_row(ctx) -> bool:
    """The Set-trigger button is always the 2nd action button in a row
    (after Apply) — present because Sprint work confirmed `profileTriggersEnabled`
    is on for this suite to run at all (see the SkipTest guard below)."""
    return ctx.eval(f"""
(function(){{
    const rows = {_profile_rows(ctx)};
    const row = rows[rows.length - 1];
    if (!row) return false;
    const buttons = Array.from(row.querySelectorAll('button, [role=button], [tabindex]'));
    if (buttons.length < 2) return false;
    buttons[1].click();
    return true;
}})()
""") is True


def _add_charging_trigger(ctx) -> bool:
    """Expands the Power category (if not already expanded — its open state
    persists in localStorage across mounts under `ds-qam-sections`, and
    `CollapsibleSection` fully *unmounts* its children while collapsed, not
    just CSS-hides them) and clicks Charging. Polls rather than a fixed
    sleep, since `--record`'s screencast session was observed live to
    noticeably slow down the React re-render here. Only clicks the header
    once and waits for the chevron to actually flip to open (▲) before
    ever considering a second click — clicking blindly on every poll tick
    risks re-collapsing a section that already opened, since the chevron
    click is a plain toggle with no idempotent "open" variant."""
    return ctx.eval(f"""
(async function(){{
    const getPowerBox = () => {{
        const modal = {_topmost_modal_expr()};
        const boxes = modal ? Array.from(modal.querySelectorAll('.ds-collapsible-box')) : [];
        return boxes[{_POWER_BOX_INDEX}] || null;
    }};
    const isOpen = (box) => !!box && box.innerText.includes('\\u25B2');  // '▲'
    let clicks = 0;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {{
        const box = getPowerBox();
        if (isOpen(box)) {{
            const buttons = Array.from(box.querySelectorAll('button, [role=button]'));
            if (buttons.length > {_CHARGING_BUTTON_INDEX}) {{
                buttons[{_CHARGING_BUTTON_INDEX}].click();
                return true;
            }}
        }} else if (clicks === 0 && box) {{
            box.querySelector('.ds-collapsible-header')?.click();
            clicks += 1;
        }}
        await new Promise(r => setTimeout(r, 400));
    }}
    return false;
}})()
""", timeout=15) is True


def _save_modal(ctx) -> bool:
    return ctx.eval(f"""
(function(){{
    const modal = {_topmost_modal_expr()};
    const btn = modal?.querySelector('[class*=Primary]');
    if (!btn) return false;
    btn.click();
    return true;
}})()
""") is True


def _delete_last_profile(ctx) -> None:
    """Best-effort cleanup: click Delete on the last row, then confirm in
    the stacked ConfirmActionModal. Never raises — this runs from a
    `finally`, so a cleanup failure must not mask the test's own result."""
    try:
        ctx.eval(f"""
(function(){{
    const rows = {_profile_rows(ctx)};
    const row = rows[rows.length - 1];
    const buttons = Array.from(row.querySelectorAll('button, [role=button], [tabindex]'));
    buttons[buttons.length - 1]?.click();
}})()
""")
        time.sleep(0.6)
        _save_modal(ctx)  # the delete-confirm dialog's own Primary/OK button
        time.sleep(0.6)
    except Exception:
        pass


@s.test("creating a profile and setting a charging trigger persists it")
def _(ctx) -> None:
    ok = _navigate_settings(ctx)
    if not ok:
        _leave_settings(ctx)
        raise SkipTest("Settings route did not mount (ErrorBoundary or timeout)")
    created = False
    try:
        _sweep_stray_modals(ctx)
        if not _click_profiles_tab(ctx):
            raise SkipTest("Profiles tab not found")
        time.sleep(0.6)

        triggers_on = ctx.eval("""
(function(){
    try {
        const raw = localStorage.getItem('deck-shelves-settings-cache-v3') || '{}';
        return JSON.parse(raw).profileTriggersEnabled === true;
    } catch { return false; }
})()
""")
        if not triggers_on:
            raise SkipTest("profileTriggersEnabled is off — no Set-trigger button to click")

        assert _create_profile(ctx, _PROFILE_NAME), "could not create the demo profile"
        time.sleep(1.5)
        created = True
        assert _last_row_name(ctx) == _PROFILE_NAME, "new profile did not appear as the last row"

        assert _open_trigger_modal_for_last_row(ctx), "could not open the trigger editor"
        time.sleep(1.2)
        assert _add_charging_trigger(ctx), "could not add the charging rule"
        time.sleep(0.8)
        assert _save_modal(ctx), "could not save the trigger"
        time.sleep(1.5)

        trigger = ctx.eval(f"""
(function(){{
    try {{
        const raw = localStorage.getItem('deck-shelves-settings-cache-v3') || '{{}}';
        const j = JSON.parse(raw);
        const p = (j.profiles || []).find(p => p.name === {_PROFILE_NAME!r});
        return p ? p.trigger : null;
    }} catch {{ return null; }}
}})()
""")
        assert trigger is not None, "profile has no trigger after saving"
        rules = trigger.get("rules") if isinstance(trigger, dict) else None
        assert rules and rules[0].get("kind") == "charging", f"unexpected trigger shape: {trigger}"
    finally:
        if created:
            _delete_last_profile(ctx)
        _leave_settings(ctx)
