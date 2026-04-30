"""
Navigation primitives — actions that move the running Steam UI to a
specific state before a screenshot is taken. Each function returns
quickly; callers pair them with `sleep` waits as needed.
"""
from __future__ import annotations

import time
from typing import Optional

from .cdp import Session


OPEN_QAM_EXPR = """
(function(){
  if (typeof SteamUIStore !== 'undefined' &&
      SteamUIStore.WindowStore &&
      SteamUIStore.WindowStore.GamepadUIMainWindowInstance &&
      SteamUIStore.WindowStore.GamepadUIMainWindowInstance.OnQuickAccessButtonPressed) {
    SteamUIStore.WindowStore.GamepadUIMainWindowInstance.OnQuickAccessButtonPressed();
    return 'ok';
  }
  return 'not found';
})()
"""

CLOSE_QAM_EXPR = """
(function(){
  try {
    const w = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    if (w?.OnQuickAccessButtonPressed) { w.OnQuickAccessButtonPressed(); return 'closed'; }
  } catch {}
  return 'no-op';
})()
"""

OPEN_MAINMENU_EXPR = """
(function(){
  try {
    const w = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    if (w?.OnSteamButtonPressed) { w.OnSteamButtonPressed(); return 'ok'; }
  } catch {}
  return 'not found';
})()
"""

NAVIGATE_HOME_EXPR = """
(function(){
  try {
    const nav = SteamUIStore?.MainRunningApp ? null : null;
    if (typeof Router !== 'undefined' && Router?.Navigate) {
      Router.Navigate('/library/home');
      return 'ok';
    }
  } catch {}
  return 'not found';
})()
"""

NAVIGATE_LIBRARY_EXPR = """
(function(){
  try {
    if (typeof Router !== 'undefined' && Router?.Navigate) {
      Router.Navigate('/library');
      return 'ok';
    }
  } catch {}
  return 'not found';
})()
"""

NAVIGATE_ABOUT_EXPR = """
(function(){
  try {
    if (typeof Router !== 'undefined' && Router?.Navigate) {
      Router.Navigate('/deck-shelves/about');
      return 'ok';
    }
  } catch {}
  return 'not found';
})()
"""


def open_qam(sjc: Session, settle_ms: int = 1500) -> None:
    sjc.evaluate(OPEN_QAM_EXPR)
    time.sleep(settle_ms / 1000.0)


def close_qam(sjc: Session, settle_ms: int = 800) -> None:
    sjc.evaluate(CLOSE_QAM_EXPR)
    time.sleep(settle_ms / 1000.0)


def open_main_menu(sjc: Session, settle_ms: int = 1500) -> None:
    sjc.evaluate(OPEN_MAINMENU_EXPR)
    time.sleep(settle_ms / 1000.0)


def navigate(sjc: Session, route: str, settle_ms: int = 2000) -> None:
    expr = f"""(function(){{ if (typeof Router !== 'undefined' && Router?.Navigate) {{ Router.Navigate({route!r}); return 'ok'; }} return 'not found'; }})()"""
    sjc.evaluate(expr)
    time.sleep(settle_ms / 1000.0)


def navigate_home(sjc: Session, settle_ms: int = 2000) -> None:
    navigate(sjc, "/library/home", settle_ms)


def navigate_library(sjc: Session, settle_ms: int = 2000) -> None:
    navigate(sjc, "/library", settle_ms)


def navigate_about(sjc: Session, settle_ms: int = 2000) -> None:
    navigate(sjc, "/deck-shelves/about", settle_ms)


def click_selector(sjc: Session, selector: str, settle_ms: int = 600) -> bool:
    """Click the first element matching the selector via DOM query."""
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


def set_qa_override(sjc: Session, key: str, value: Optional[str] = None) -> None:
    """Set a QA harness override flag in localStorage. Useful for forcing a
    state (e.g. `__QA_FIRST_RUN__`). Pass `value=None` to clear."""
    if value is None:
        expr = f"""(function(){{ try {{ localStorage.removeItem({key!r}); }} catch{{}} return 'ok'; }})()"""
    else:
        expr = f"""(function(){{ try {{ localStorage.setItem({key!r}, {value!r}); }} catch{{}} return 'ok'; }})()"""
    sjc.evaluate(expr)
