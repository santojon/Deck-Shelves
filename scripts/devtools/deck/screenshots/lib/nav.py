"""
Navigation primitives — actions that move the running Steam UI to a
specific state before a screenshot is taken.
"""
from __future__ import annotations

import time
from typing import Any, Optional

from .cdp import Session, open_session, list_targets, find_target


OPEN_QAM_EXPR = """
(function(){
  try {
    const w = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    if (w?.OnQuickAccessButtonPressed) { w.OnQuickAccessButtonPressed(); return 'ok:OnQuickAccessButtonPressed'; }
    if (w?.ToggleQuickAccessMenu)       { w.ToggleQuickAccessMenu();       return 'ok:ToggleQuickAccessMenu'; }
    const store = SteamUIStore?.GamepadUIStore ?? SteamUIStore?.MainWindowStore;
    if (store?.OpenQuickAccess)          { store.OpenQuickAccess();         return 'ok:GamepadUIStore.OpenQuickAccess'; }
    if (store?.ToggleQuickAccessMenu)    { store.ToggleQuickAccessMenu();   return 'ok:GamepadUIStore.Toggle'; }
    if (SteamClient?.UI?.OpenQuickAccessMenu) {
      SteamClient.UI.OpenQuickAccessMenu(); return 'ok:SteamClient.UI';
    }
    if (SteamClient?.Overlay?.OpenQuickAccessMenu) {
      SteamClient.Overlay.OpenQuickAccessMenu(); return 'ok:SteamClient.Overlay';
    }
    window.dispatchEvent(new CustomEvent('gamepadbutton', { detail: { button: 'qam', pressed: true } }));
    return 'ok:event';
  } catch(e) { return 'error:' + String(e); }
})()
"""

CLOSE_QAM_EXPR = """
(function(){
  try {
    const w = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    if (w?.OnQuickAccessButtonPressed) { w.OnQuickAccessButtonPressed(); return 'closed:OnQuickAccessButtonPressed'; }
    if (w?.ToggleQuickAccessMenu)       { w.ToggleQuickAccessMenu();       return 'closed:ToggleQuickAccessMenu'; }
    const store = SteamUIStore?.GamepadUIStore ?? SteamUIStore?.MainWindowStore;
    if (store?.CloseQuickAccess)         { store.CloseQuickAccess();        return 'closed:GamepadUIStore.Close'; }
    if (store?.ToggleQuickAccessMenu)    { store.ToggleQuickAccessMenu();   return 'closed:GamepadUIStore.Toggle'; }
    if (SteamClient?.UI?.CloseQuickAccessMenu)      { SteamClient.UI.CloseQuickAccessMenu();      return 'closed:SteamClient.UI'; }
    if (SteamClient?.Overlay?.CloseQuickAccessMenu) { SteamClient.Overlay.CloseQuickAccessMenu(); return 'closed:SteamClient.Overlay'; }
  } catch {}
  return 'no-op';
})()
"""

_NAVIGATE_HOME_EXPR = """
(function(){
  try { SteamClient.Navigation.Navigate('/library/home'); return 'steamclient'; } catch(e) {}
  try { Router.Navigate('/library/home'); return 'router'; } catch(e) {}
  return 'failed';
})()
"""

_OPEN_MAINMENU_EXPR = """
(function(){
  try {
    var inst = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    if (inst) {
      if (typeof inst.OpenMainMenu === 'function') { inst.OpenMainMenu(); return 'open-instance'; }
      if (typeof inst.OnMainMenuButtonPressed === 'function') { inst.OnMainMenuButtonPressed(); return 'open-button'; }
      if (typeof inst.OnSteamButtonPressed === 'function') { inst.OnSteamButtonPressed(); return 'open-steam'; }
    }
    return 'no-entrypoint';
  } catch(e) { return 'err'; }
})()
"""

_IS_QAM_OPEN_EXPR = """
(function(){
  var qam = document.querySelector('[class*="QuickAccessMenu"], [class*="quickaccessmenu"]');
  if (!qam) return false;
  var cs = getComputedStyle(qam);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
})()
"""

_DS_SCOPE_CHECK = "!!document.querySelector('.deck-shelves-qam-scope')"

_DECKY_TAB_CLICK = """
(function(){
  if (document.querySelector('.deck-shelves-qam-scope')) return 'already';
  var tabs = Array.from(document.querySelectorAll('[role=tab]'));
  for (var i = tabs.length - 1; i >= 0; i--) {
    var svg = tabs[i].querySelector('svg');
    if (svg && svg.innerHTML.indexOf('M320') !== -1) { tabs[i].click(); return 'decky'; }
  }
  if (tabs.length) { tabs[tabs.length - 1].click(); return 'last'; }
  return 'no-tabs';
})()
"""

_DS_PLUGIN_CLICK = """
(function(){
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while (node = walker.nextNode()) {
    if ((node.textContent || '').trim() === 'Deck Shelves') {
      var el = node.parentElement;
      for (var i = 0; i < 5 && el; i++) {
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
          el.click(); return 'button';
        }
        el = el.parentElement;
      }
      el = node.parentElement;
      for (var i = 0; i < 8 && el; i++) {
        if (el.classList && el.classList.contains('Focusable')) {
          el.click(); return 'focusable';
        }
        el = el.parentElement;
      }
      return 'found-no-click';
    }
  }
  return 'not-found';
})()
"""

_CLICK_MAINMENU_HOME_EXPR = """
(function(){
  var candidates = Array.from(document.querySelectorAll(
    'button, [role="button"], .Focusable, [tabindex]:not([tabindex="-1"])'
  )).filter(function(el){
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) return false;
      var cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    } catch(_){ return false; }
  });
  if (!candidates.length) return 'empty';
  candidates.sort(function(a, b){
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });
  candidates[0].click();
  return 'clicked';
})()
"""


# ---------------------------------------------------------------------------
# Surface helpers — run JS in the correct target window.
# SJC (SharedJSContext) has no DOM; DOM manipulation targets BP or QAM.
# ---------------------------------------------------------------------------

def _bp_eval(host: str, port: int, expr: str) -> Any:
    """Run a JS expression in the Big Picture window."""
    try:
        sess = open_session(host, port, "Big Picture")
        try:
            return sess.evaluate(expr)
        finally:
            sess.close()
    except Exception:
        return None


def _qam_eval(host: str, port: int, expr: str) -> Any:
    """Run a JS expression in the QAM popup target."""
    try:
        sess = open_session(host, port, "QuickAccess")
        try:
            return sess.evaluate(expr)
        finally:
            sess.close()
    except Exception:
        return None


def _escape_bp(host: str, port: int, count: int = 1) -> None:
    """Send `count` Escape keypresses to the Big Picture window."""
    try:
        sess = open_session(host, port, "Big Picture")
        try:
            for _ in range(count):
                sess.call("Input.dispatchKeyEvent", {
                    "type": "keyDown", "key": "Escape", "code": "Escape",
                    "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27,
                })
                time.sleep(0.08)
                sess.call("Input.dispatchKeyEvent", {
                    "type": "keyUp", "key": "Escape", "code": "Escape",
                    "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27,
                })
                time.sleep(0.12)
        finally:
            sess.close()
    except Exception:
        pass


def _is_qam_open(host: str, port: int) -> bool:
    """Check if the QAM panel is currently visible in the Big Picture DOM."""
    result = _bp_eval(host, port, _IS_QAM_OPEN_EXPR)
    return result is True


def open_qam(sjc: Session, settle_ms: int = 1500) -> None:
    try:
        sjc.evaluate(OPEN_QAM_EXPR)
    except Exception:
        pass
    time.sleep(settle_ms / 1000.0)


def close_qam(sjc: Session, settle_ms: int = 800) -> None:
    try:
        sjc.evaluate(CLOSE_QAM_EXPR)
    except Exception:
        pass
    time.sleep(settle_ms / 1000.0)


def navigate_home(sjc: Session, settle_ms: int = 2000) -> None:
    try:
        sjc.evaluate(_NAVIGATE_HOME_EXPR)
    except Exception:
        pass
    time.sleep(settle_ms / 1000.0)


def navigate(sjc: Session, route: str, settle_ms: int = 2000) -> None:
    expr = f"""(function(){{ if (typeof Router !== 'undefined' && Router?.Navigate) {{ Router.Navigate({route!r}); return 'ok'; }} return 'not found'; }})()"""
    try:
        sjc.evaluate(expr)
    except Exception:
        pass
    time.sleep(settle_ms / 1000.0)


def navigate_about(sjc: Session, settle_ms: int = 2000) -> None:
    navigate(sjc, "/deck-shelves/about", settle_ms)


def click_selector(sjc: Session, selector: str, settle_ms: int = 600) -> bool:
    """Click the first element matching the CSS selector in the SJC DOM."""
    expr = f"""
(function(){{
  const el = document.querySelector({selector!r});
  if (!el) return 'not found';
  el.click();
  return 'ok';
}})()
"""
    result = sjc.evaluate(expr)
    time.sleep(settle_ms / 1000.0)
    return result == "ok"


def await_selector(sjc: Session, selector: str, timeout_ms: int = 5000, interval_ms: int = 200) -> bool:
    """Poll until selector exists in the DOM or timeout. Returns True on found."""
    deadline = time.time() + (timeout_ms / 1000.0)
    expr = f"""(function(){{ return !!document.querySelector({selector!r}); }})()"""
    while time.time() < deadline:
        if sjc.evaluate(expr) is True:
            return True
        time.sleep(interval_ms / 1000.0)
    return False


def dismiss_bp_modals(host: str, port: int) -> None:
    """Navigate BP to home to dismiss any open Decky modal or overlay."""
    _bp_eval(host, port, _NAVIGATE_HOME_EXPR)
    time.sleep(1.0)


def ensure_bp_clean(sjc: Session, host: str, port: int) -> None:
    """Navigate to a clean home screen without overlays.

    Closes QAM if open, then navigates from within the Big Picture window
    (not SJC — SJC navigation opens the Steam menu overlay as a side effect).
    """
    if _is_qam_open(host, port):
        try:
            sjc.evaluate(CLOSE_QAM_EXPR)
        except Exception:
            pass
        time.sleep(1.0)
    # Navigate from BP, not SJC. SJC's Router.Navigate('/library/home')
    # triggers the Steam main-menu navigation overlay; BP's own Router does not.
    _bp_eval(host, port, _NAVIGATE_HOME_EXPR)
    time.sleep(3.0)


def expand_qam_sections(host: str, port: int) -> str:
    """Force-open all DS QAM CollapsibleSections.

    Sets localStorage so any newly-mounted section defaults to open, then
    dispatches a click event on every header whose innerHTML still contains ▼
    (the collapsed indicator). Uses dispatchEvent(MouseEvent) rather than
    .click() for reliable React synthetic event delivery.
    Scroll is reset to top first so sections render from the beginning.
    """
    expr = r"""
(function(){
  // Reset scroll to top so sections appear in order.
  var scope = document.querySelector('.deck-shelves-qam-scope');
  if (scope) scope.scrollTop = 0;

  // Pre-open all known sections in localStorage so unmounted ones default open.
  try {
    var KEY = 'ds-qam-sections';
    var state = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) {}
    ['behavior','shelves','smart','visual_global','saved_filters'].forEach(function(id){ state[id] = true; });
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch(e) {}

  // Click any currently-collapsed headers (already-mounted components).
  var headers = Array.from(document.querySelectorAll('[data-ds-section]'));
  if (!headers.length) {
    headers = Array.from(document.querySelectorAll('.ds-collapsible-header'));
  }
  var expanded = 0;
  headers.forEach(function(h) {
    if ((h.innerHTML || '').indexOf('▼') !== -1) {
      h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expanded++;
    }
  });
  return 'expanded:' + expanded + ' of ' + headers.length;
})()
"""
    result = _qam_eval(host, port, expr) or "no-result"
    time.sleep(0.8)
    return result


def click_context_menu_edit(host: str, port: int) -> str:
    """Click the 'Edit' item in a Decky context menu (runs in Big Picture target).

    Decky's showContextMenu renders in the Big Picture DOM, not the QAM popup.
    """
    expr = """
(function(){
  var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
  for (var el of items) {
    var text = (el.textContent || '').trim();
    if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1 ||
        text.indexOf('Modifier') !== -1 || text.indexOf('Bearbeiten') !== -1) {
      el.click(); return 'clicked:' + text;
    }
  }
  // Fallback: first visible menuitem
  var first = document.querySelector('[role=menuitem]');
  if (first) { first.click(); return 'first-menuitem'; }
  return 'not-found';
})()
"""
    result = _bp_eval(host, port, expr) or "no-result"
    time.sleep(0.3)
    return result


def click_context_menu_delete(host: str, port: int) -> str:
    """Click the 'Delete' item in a Decky context menu (runs in Big Picture target)."""
    expr = """
(function(){
  var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
  for (var el of items) {
    var text = (el.textContent || '').trim();
    if (text === 'Delete' || text === 'Apagar' || text === 'Deletar' ||
        text.indexOf('Remov') !== -1 || text.indexOf('Exclu') !== -1) {
      el.click(); return 'clicked:' + text;
    }
  }
  return 'not-found';
})()
"""
    result = _bp_eval(host, port, expr) or "no-result"
    time.sleep(0.3)
    return result


def _try_navigate_ds_tab(host: str, port: int) -> bool:
    """Single attempt to navigate to Deck Shelves tab in the open QAM.

    Opens a fresh QuickAccess session, clicks the Decky tab, then searches
    for the 'Deck Shelves' plugin entry (with scroll retry). Returns True
    when .deck-shelves-qam-scope is confirmed visible.
    """
    try:
        qam = open_session(host, port, "QuickAccess")
    except Exception:
        return False
    try:
        if qam.evaluate(_DS_SCOPE_CHECK) is True:
            return True
        qam.evaluate(_DECKY_TAB_CLICK)
        time.sleep(2.0)
        if qam.evaluate(_DS_SCOPE_CHECK) is True:
            return True
        for _ in range(3):
            result = qam.evaluate(_DS_PLUGIN_CLICK)
            if result == "not-found":
                qam.evaluate("""(function(){
  var ps = document.querySelectorAll('[class*=scroll],[style*=overflow]');
  for (var p of ps) { if (p.scrollHeight > p.clientHeight) { p.scrollTop += 200; return; } }
})()""")
                time.sleep(1.0)
                continue
            time.sleep(1.5)
            if qam.evaluate(_DS_SCOPE_CHECK) is True:
                return True
        return False
    finally:
        qam.close()


def navigate_to_ds_qam(sjc: Session, host: str, port: int, settle_ms: int = 2000) -> bool:
    """Open QAM and ensure Deck Shelves plugin tab is active.

    No Escape keypresses — Escape on the home screen toggles the Steam menu.
    Navigation is done from the Big Picture window (not SJC) to avoid opening
    the Steam menu overlay as a side-effect.

      1. Close QAM if open (avoid toggle-close)
      2. Navigate home from BP
      3. Open QAM fresh
      4. Navigate to DS tab (with retry: close/reopen if first attempt fails)
    """
    # Phase 1: Close QAM if open.
    if _is_qam_open(host, port):
        try:
            sjc.evaluate(CLOSE_QAM_EXPR)
        except Exception:
            pass
        time.sleep(1.0)

    # Phase 2: Navigate home from BP (not SJC — avoids Steam menu overlay).
    _bp_eval(host, port, _NAVIGATE_HOME_EXPR)
    time.sleep(2.5)

    # Phase 3: Open QAM fresh.
    open_qam(sjc, settle_ms=settle_ms)

    # Phase 4: Navigate to Deck Shelves tab — first attempt.
    if _try_navigate_ds_tab(host, port):
        return True

    # Retry: close QAM, reopen, try once more.
    close_qam(sjc, settle_ms=800)
    time.sleep(0.5)
    open_qam(sjc, settle_ms=2000)
    return _try_navigate_ds_tab(host, port)
