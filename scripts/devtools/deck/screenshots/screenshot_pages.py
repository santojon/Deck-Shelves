#!/usr/bin/env python3
"""Per-page screenshot helpers (home / qam / game). Split from screenshot.py
to keep both files under the per-file code-line cap."""
import base64
import os
import sys
import time
from pathlib import Path
from typing import Dict, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from screenshot import (  # type: ignore[import-not-found]
    OUTPUT_DIR,
    cancel_bp_modal,
    capture_bigpicture,
    capture_qam_with_fallback,
    cdp_call,
    click_qam_button,
    close_qam,
    dismiss_bp_escape,
    ensure_bp_clean,
    eval_target,
    is_qam_open,
    navigate_to_deckshelves_qam,
    open_qam,
    scroll_bp,
    ws_connect,
    ws_path_for,
)

def screenshot_home(host: str, port: int, bp: Dict) -> Optional[Path]:
    print("  Garantindo que está no topo e sem overlays...")
    ws_path_for(bp, port)
    # Scroll para o topo
    for _ in range(5):
        scroll_bp(host, port, bp, -2000)
        time.sleep(0.2)
    # Fechar overlays e menus múltiplas vezes para garantir foco
    for _ in range(3):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.3)
    time.sleep(0.7)
    print("  Capturando Home screen...")
    return capture_bigpicture(host, port, bp, "home.png")


def screenshot_home_shelves(host: str, port: int, bp: Dict) -> Optional[Path]:
    """Scroll to top, then down to first shelf and capture."""
    bp_ws = ws_path_for(bp, port)

    # Navega explicitamente para Home e fecha overlays
    print("  Garantindo que está na Home e sem overlays...")
    try:
        eval_target(host, port, ws_path_for(bp, port), "SteamClient.Navigation.Navigate('/library/home')")
        time.sleep(2.0)
        # Fechar overlays e menus múltiplas vezes para garantir foco
        for _ in range(3):
            dismiss_bp_escape(host, port, bp)
            time.sleep(0.3)
        time.sleep(0.7)
    except Exception as e:
        print(f"  [WARN] Falha ao garantir Home: {e}")

    # Scroll all the way to top first
    print("  Scrolling to top...")
    for _ in range(5):
        scroll_bp(host, port, bp, -2000)
        time.sleep(0.3)
    time.sleep(1.5)

    # Find all shelf rows (must be at least 2)
    shelf_rows = eval_target(host, port, bp_ws, """
(function() {
    var cards = Array.from(document.querySelectorAll('.ds-card'));
    if (cards.length < 2) return null;
    // Find unique rows for each card
    var rows = cards.map(card => card.closest('[class*=HorizontalScroll], [class*=Row]') || card.parentElement);
    // Filter unique rows by DOM position
    var uniqueRows = [];
    var seen = new Set();
    for (var row of rows) {
        if (!row) continue;
        var key = row.getBoundingClientRect().top + ':' + row.getBoundingClientRect().left;
        if (!seen.has(key)) { uniqueRows.push(row); seen.add(key); }
    }
    if (uniqueRows.length < 2) return null;
    return uniqueRows.slice(0,2).map(row => row.getBoundingClientRect().top);
})()
""")
    if not shelf_rows or not isinstance(shelf_rows, list) or len(shelf_rows) < 2:
        print("  [ERROR] At least 2 shelves are required for the home-shelves screenshot. Please create a second shelf and try again.")
        return None

    # Scroll so the second shelf row top lands around y=200
    row_top = shelf_rows[1]
    target_y = 200
    scroll_needed = int(row_top - target_y)
    if scroll_needed > 50:
        steps = max(1, scroll_needed // 300)
        per_step = scroll_needed // steps
        for _ in range(steps):
            scroll_bp(host, port, bp, per_step)
            time.sleep(0.4)
        time.sleep(3.0)
    else:
        time.sleep(2.0)

    # Extra settle time for scroll animation and asset loading to finish
    time.sleep(3.0)

    # Garante que nenhum overlay/QAM/menu está aberto
    for _ in range(3):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.3)
    time.sleep(0.7)

    # Park focus on the first DS card and move one slot to the right so
    # the capture shows an intentional focus state instead of whatever
    # the framework was settling onto. Two-stage so the focusin handler
    # finishes centering before the right-move kicks in.
    print("  Setting deterministic focus (first card + ArrowRight)...")
    eval_target(host, port, bp_ws, """
(function(){
  const card = document.querySelector('.ds-shelf[data-shelfid] .ds-card');
  if (card) try { card.focus(); } catch {}
  return 'ok';
})()
""")
    time.sleep(0.6)
    eval_target(host, port, bp_ws, """
(function(){
  const evt = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  (document.activeElement || document).dispatchEvent(evt);
  document.dispatchEvent(evt);
  return 'ok';
})()
""")
    # Settle generously: the right-move triggers a smooth horizontal
    # scroll, image swaps from the new focused card, and a focus-glow
    # animation. Capturing too early leaves residual UI mid-animation
    # in the frame.
    time.sleep(3.0)

    result = capture_bigpicture(host, port, bp, "home-shelves.png")

    # Scroll back to top
    for _ in range(5):
        scroll_bp(host, port, bp, -2000)
        time.sleep(0.3)
    time.sleep(0.5)
    return result


_QAM_PANEL_CLIP_EXPR = """
(function(){
  const sel = [
    '[id^="quickaccess_content_"]',
    '[class*="quickaccessmenu_PanelOuterNav"]',
    '[class*="QuickAccess"][class*="Panel"]',
    '#QuickAccess-Menu',
    '#QuickAccess-NA',
  ];
  let el = null;
  for (const s of sel) { const m = document.querySelector(s); if (m) { el = m; break; } }
  if (!el) {
    const candidates = Array.from(document.querySelectorAll('[class]'));
    for (const c of candidates) {
      const cls = String(c.className || '');
      if (cls.includes('QuickAccess') || cls.includes('quickaccess')) { el = c; break; }
    }
  }
  if (!el) return null;
  let best = el;
  let bestRect = el.getBoundingClientRect();
  for (let p = el.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
    const pr = p.getBoundingClientRect();
    if (pr.width <= 0 || pr.height <= 0) continue;
    if (pr.width > bestRect.width * 1.15) break;
    best = p; bestRect = pr;
  }
  return {
    x: Math.max(0, Math.floor(bestRect.left)),
    y: Math.max(0, Math.floor(bestRect.top)),
    width: Math.max(1, Math.ceil(bestRect.width)),
    height: Math.max(1, Math.ceil(bestRect.height)),
    scale: 1,
  };
})()
"""


def capture_qam_target(host: str, port: int, qam_target: Dict, filename: str) -> Optional[Path]:
    """Capture screenshot from QAM popup target, clipped to the panel
    bounding box so the resulting PNG is the actual portrait QAM shape
    instead of the wider popup viewport (which leaves a black band on
    the right of the visible panel)."""
    ws_path = ws_path_for(qam_target, port)
    sock = ws_connect(host, port, ws_path)
    try:
        cdp_call(sock, "Page.enable", msg_id=1)
        # Measure the panel rect first; fall back to full-viewport when it
        # can't be located (e.g. popup hasn't rendered yet — earlier retry
        # logic in capture_qam_with_fallback handles those blank frames).
        clip_msg = cdp_call(sock, "Runtime.evaluate", {"expression": _QAM_PANEL_CLIP_EXPR, "returnByValue": True}, msg_id=2)
        clip = (clip_msg.get("result", {}).get("result", {}) or {}).get("value")
        params: Dict = {"format": "png", "fromSurface": False}
        if isinstance(clip, dict) and clip.get("width", 0) >= 50 and clip.get("height", 0) >= 50:
            params["clip"] = clip
            params["captureBeyondViewport"] = False
        result = cdp_call(sock, "Page.captureScreenshot", params, msg_id=3)
        data = result.get("result", {}).get("data", "")
        # Always write the file, even if data is empty (write empty file)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out = OUTPUT_DIR / filename
        raw = base64.b64decode(data) if data else b""
        out.write_bytes(raw)
        print(f"  Saved {filename} ({len(raw):,} bytes)")
        return out
    finally:
        try:
            sock.close()
        except Exception:
            pass


def screenshot_qam(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: Optional[str], qam_target: Optional[Dict] = None) -> Optional[Path]:
    if qam_ws:
        ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
        if not ok:
            print("  [ERROR] Could not open Deck Shelves QAM — skipping screenshot")
            return None
    else:
        ensure_bp_clean(host, port, bp, shared_ws)
        open_qam(host, port, shared_ws)
        time.sleep(2.0)

    print("  Capturing QAM...")
    result = capture_qam_with_fallback(host, port, bp, qam_target, "qam.png")

    print("  Closing QAM...")
    close_qam(host, port, shared_ws)
    time.sleep(0.5)

    return result


def screenshot_game_detail(host: str, port: int, bp: Dict, shared_ws: str) -> Optional[Path]:
    """Capture game detail page by pressing A on a shelf game card."""
    bp_ws = ws_path_for(bp, port)
    appid = eval_target(host, port, bp_ws, """
(function() {
    var card = document.querySelector('.ds-card[data-appid]');
    return card ? card.getAttribute('data-appid') : null;
})()
""")
    if not appid:
        print("  [WARN] No ds-card found for game-detail capture")
        return None

    print(f"  Activating game card (appid {appid})...")
    eval_target(host, port, bp_ws, f"""
        (function() {{
            var card = document.querySelector('.ds-card[data-appid=\"{appid}\"]');
            if (card) card.dispatchEvent(new Event('vgp_onok', {{bubbles: true}}));
        }})()
    """)
    time.sleep(3.0)

    # Apenas garante retorno à Home, sem capturar screenshot
    print("  Tentando voltar para Home pressionando B...")
    def is_home():
        # Verifica se está na Home pelo seletor de prateleiras
        try:
            val = eval_target(host, port, bp_ws, "document.querySelectorAll('.ds-card[data-appid]').length")
            return val is not None and int(val) > 0
        except Exception:
            return False

    max_attempts = 3
    for attempt in range(max_attempts):
        if is_home():
            print("  Retornou para Home com sucesso.")
            break
        # Pressiona B (Escape)
        print(f"  Pressionando B (tentativa {attempt+1})...")
        ws_path = ws_path_for(bp, port)
        sock = ws_connect(host, port, ws_path)
        try:
            cdp_call(sock, "Input.dispatchKeyEvent", {
                "type": "keyDown", "key": "Escape", "code": "Escape",
                "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27,
            }, msg_id=1)
            time.sleep(0.2)
            cdp_call(sock, "Input.dispatchKeyEvent", {
                "type": "keyUp", "key": "Escape", "code": "Escape",
                "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27,
            }, msg_id=2)
        finally:
            sock.close()
        time.sleep(2.0)
    else:
        print("  [WARN] Não foi possível garantir retorno à Home após 3 tentativas.")

    return None


def screenshot_game_menu(host: str, port: int, bp: Dict, shared_ws: str) -> Optional[Path]:
    """Capture game context menu by pressing Menu on a shelf game card."""
    bp_ws = ws_path_for(bp, port)

    # Wait for cards to be available
    for _ in range(5):
        count = eval_target(host, port, bp_ws, """
(function() { return document.querySelectorAll('.ds-card[data-appid]').length; })()
""")
        if count and int(count) > 0:
            break
        time.sleep(2.0)

    appid = eval_target(host, port, bp_ws, """
(function() {
    var card = document.querySelector('.ds-card[data-appid]');
    return card ? card.getAttribute('data-appid') : null;
})()
""")
    if not appid:
        print("  [WARN] No ds-card found for game-menu capture")
        return None

    print(f"  Opening game context menu (appid {appid})...")
    eval_target(host, port, bp_ws, f"""
(function() {{
    var card = document.querySelector('.ds-card[data-appid="{appid}"]');
    if (card) card.dispatchEvent(new Event('vgp_onmenubutton', {{bubbles: true}}));
}})()
""")
    time.sleep(2.5)
    result = capture_bigpicture(host, port, bp, "game-menu.png")

    print("  Dismissing context menu...")
    dismiss_bp_escape(host, port, bp)
    time.sleep(0.5)
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(0.5)
    return result


def _open_qam_and_tab(host: str, port: int, shared_ws: str, qam_ws: str, bp: Optional[Dict] = None) -> bool:
    """Ensure we end up in the Deck Shelves QAM, regardless of current state.

    Handles: overlays open, wrong page, QAM open on wrong tab, QAM closed, etc.
    Returns True if Deck Shelves QAM is active, False if not found.
    """
    # Phase 1: Clean slate — dismiss all overlays and modals
    if bp:
        for _ in range(5):
            dismiss_bp_escape(host, port, bp)
            time.sleep(0.2)

    # Phase 2: Close QAM if open (we'll reopen cleanly)
    try:
        bp_ws = ws_path_for(bp, port) if bp else None
        if bp_ws and is_qam_open(host, port, bp_ws):
            close_qam(host, port, shared_ws)
            time.sleep(1.0)
    except:
        pass

    # Phase 3: Navigate to library/home (in case we're on a game page or elsewhere)
    try:
        eval_target(host, port, shared_ws, "SteamClient.Navigation.Navigate('/library/home')")
    except:
        pass
    time.sleep(2.0)

    # Phase 4: Dismiss any lingering overlays after navigation
    if bp:
        for _ in range(3):
            dismiss_bp_escape(host, port, bp)
            time.sleep(0.15)

    # Phase 5: Open QAM fresh
    open_qam(host, port, shared_ws)
    time.sleep(2.0)

    # Phase 6: Navigate to Deck Shelves
    ok = navigate_to_deckshelves_qam(host, port, qam_ws)
    if not ok:
        # Last resort: close QAM, reopen, try once more
        print("  [WARN] First attempt failed, retrying...")
        close_qam(host, port, shared_ws)
        time.sleep(1.0)
        open_qam(host, port, shared_ws)
        time.sleep(2.0)
        ok = navigate_to_deckshelves_qam(host, port, qam_ws)

    if not ok:
        print("  [ERROR] Could not navigate to Deck Shelves in QAM")
        return False
    return True


def screenshot_shelf_actions(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture shelf context menu (ellipsis button)."""
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        result = capture_bigpicture(host, port, bp, "shelf-actions.png")
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.5)
    else:
        print("  [WARN] Could not find ellipsis button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result
