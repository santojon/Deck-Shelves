#!/usr/bin/env python3
"""Take Steam Deck GamepadUI screenshots via CDP.

Captures the Home screen, QAM panel, shelf management modals, and game
card actions by connecting to the CEF debug port through an SSH tunnel.

The "Big Picture" CDP target renders the composited GamepadUI background.
Popup targets (QAM, MainMenu, notifications) are overlay browser views
that require fromSurface=false for Page.captureScreenshot to work.

To open/close the QAM, the script calls
SteamUIStore.WindowStore.GamepadUIMainWindowInstance.OnQuickAccessButtonPressed()
via SharedJSContext, then navigates to the Deck Shelves tab by clicking
its element in the QuickAccess_uid2 DOM.

Prerequisites:
  1. CEF remote debugging enabled on Steam Deck:
     Settings → Developer → Enable CEF Remote Debugging → restart Steam
  2. SSH tunnel from local machine to Steam Deck:
     ssh -f -N -L 8081:localhost:8081 deck@steamdeck

Targets:
  home          Home screen (top)
  home-shelves  Home screen scrolled to show shelves
  qam           QAM with Deck Shelves tab active
  game-detail   Game detail page (A button on shelf game)
  game-menu     Game context menu (Menu button on shelf game)
  shelf-actions Shelf context menu
  shelf-edit    Edit shelf modal
  shelf-hidden  QAM showing hidden shelf
  shelf-delete  Delete shelf confirmation dialog
  shelf-import  Import shelves modal
  shelf-export  Export shelves modal
  all           All of the above (default)

Usage:
  python3 scripts/devtools/deck/screenshot.py                        # all
  python3 scripts/devtools/deck/screenshot.py --target home          # Home only
  python3 scripts/devtools/deck/screenshot.py --target qam           # QAM only
  python3 scripts/devtools/deck/screenshot.py --target game-detail   # game A-button
  python3 scripts/devtools/deck/screenshot.py --host localhost        # explicit host

Environment:
  DECK_HOST      Hostname for CDP connection (default: localhost)
  DECK_CDP_PORT  CEF debug port (default: 8081)
"""

import argparse
import base64
import json
import os
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "assets" / "screenshots"


# ---------------------------------------------------------------------------
# WebSocket / CDP helpers
# ---------------------------------------------------------------------------

def ws_connect(host: str, port: int, path: str) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(20)
    sock.connect((host, port))
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall(
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
        .encode()
    )
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    return sock


def ws_send(sock: socket.socket, data: str) -> None:
    payload = data.encode()
    frame = bytearray([0x81])
    length = len(payload)
    if length < 126:
        frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack(">H", length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack(">Q", length))
    mask = os.urandom(4)
    frame.extend(mask)
    for i, b in enumerate(payload):
        frame.append(b ^ mask[i % 4])
    sock.sendall(bytes(frame))


def ws_recv(sock: socket.socket) -> Optional[str]:
    data = b""
    while True:
        chunk = sock.recv(262144)
        if not chunk:
            return None
        data += chunk
        if len(data) < 2:
            continue
        length = data[1] & 0x7F
        offset = 2
        if length == 126:
            if len(data) < 4:
                continue
            length = struct.unpack(">H", data[2:4])[0]
            offset = 4
        elif length == 127:
            if len(data) < 10:
                continue
            length = struct.unpack(">Q", data[2:10])[0]
            offset = 10
        if len(data) >= offset + length:
            return data[offset:offset + length].decode(errors="replace")


def cdp_call(sock: socket.socket, method: str, params: Optional[Dict] = None, msg_id: int = 1) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"id": msg_id, "method": method}
    if params:
        payload["params"] = params
    ws_send(sock, json.dumps(payload))
    while True:
        raw = ws_recv(sock)
        if raw is None:
            raise RuntimeError(f"No CDP response for {method}")
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            return msg


def cdp_eval(sock: socket.socket, expression: str, msg_id: int = 1) -> Any:
    result = cdp_call(sock, "Runtime.evaluate", {"expression": expression, "returnByValue": True}, msg_id)
    return result.get("result", {}).get("result", {}).get("value")


# ---------------------------------------------------------------------------
# Target discovery
# ---------------------------------------------------------------------------

def get_targets(host: str, port: int) -> List[Dict[str, Any]]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))
    sock.sendall(f"GET /json HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n".encode())
    resp = b""
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
            if resp.endswith(b"\n]"):
                break
        except Exception:
            break
    sock.close()
    if b"\r\n\r\n" not in resp:
        return []
    return json.loads(resp.split(b"\r\n\r\n", 1)[1])


def find_target(targets: List[Dict], title_substr: str) -> Optional[Dict]:
    for t in targets:
        if title_substr.lower() in t.get("title", "").lower():
            return t
    return None


def ws_path_for(target: Dict, port: int) -> str:
    return target["webSocketDebuggerUrl"].split(f"{port}", 1)[1]


# ---------------------------------------------------------------------------
# Screenshot capture
# ---------------------------------------------------------------------------

def capture_bigpicture(host: str, port: int, bp_target: Dict, filename: str) -> Optional[Path]:
    ws_path = ws_path_for(bp_target, port)
    sock = ws_connect(host, port, ws_path)
    try:
        cdp_call(sock, "Page.enable", msg_id=1)
        result = cdp_call(sock, "Page.captureScreenshot", {"format": "png"}, msg_id=2)
        data = result.get("result", {}).get("data", "")
        if not data:
            return None
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out = OUTPUT_DIR / filename
        raw = base64.b64decode(data)
        out.write_bytes(raw)
        print(f"  Saved {filename} ({len(raw):,} bytes)")
        return out
    finally:
        try:
            sock.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# QAM automation
# ---------------------------------------------------------------------------

OPEN_QAM_EXPR = "SteamUIStore.WindowStore.GamepadUIMainWindowInstance.OnQuickAccessButtonPressed()"

CLICK_TAB_EXPR = """
(function() {
    var all = document.querySelectorAll('*');
    for (var el of all) {
        if (el.children.length === 0 && (el.textContent || '').trim() === 'Deck Shelves') {
            var target = el.closest('button') || el.closest('[role=tab]') || el.parentElement || el;
            target.click();
            return 'ok';
        }
    }
    return 'not found';
})()
"""


def eval_target(host: str, port: int, ws_path: str, expression: str, msg_id: int = 1) -> Any:
    """Evaluate JS in any CDP target and return the result value."""
    sock = ws_connect(host, port, ws_path)
    try:
        return cdp_eval(sock, expression, msg_id)
    finally:
        sock.close()


def open_qam(host: str, port: int, shared_ws: str) -> None:
    eval_target(host, port, shared_ws, OPEN_QAM_EXPR)


def close_qam(host: str, port: int, shared_ws: str) -> None:
    open_qam(host, port, shared_ws)  # toggle


def click_deckshelves_tab(host: str, port: int, qam_ws: str) -> bool:
    result = eval_target(host, port, qam_ws, CLICK_TAB_EXPR)
    return result == "ok"


def click_qam_button(host: str, port: int, qam_ws: str, svg_hint: str, index: int = 0) -> bool:
    """Click a button in the QAM by matching SVG content hint."""
    result = eval_target(host, port, qam_ws, f"""
(function() {{
    var buttons = document.querySelectorAll('button');
    var matches = [];
    for (var b of buttons) {{
        if (b.innerHTML.indexOf('{svg_hint}') !== -1) matches.push(b);
    }}
    if (matches[{index}]) {{ matches[{index}].click(); return 'clicked'; }}
    return 'not found';
}})()
""")
    return result == "clicked"


def click_bp_menu_item(host: str, port: int, bp_ws: str, label: str) -> Optional[str]:
    """Click a context menu item by exact text label in Big Picture DOM."""
    return eval_target(host, port, bp_ws, f"""
(function() {{
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {{
        if ((el.textContent || '').trim() === '{label}') {{ el.click(); return 'ok: ' + '{label}'; }}
    }}
    return 'not found';
}})()
""")


def cancel_bp_modal(host: str, port: int, bp_ws: str) -> None:
    """Close a modal/dialog in Big Picture by clicking Cancel/Cancelar."""
    eval_target(host, port, bp_ws, """
(function() {
    var buttons = document.querySelectorAll('button');
    for (var b of buttons) {
        var text = (b.textContent || '').trim();
        if (text === 'Cancel' || text === 'Cancelar') { b.click(); return 'cancelled'; }
    }
    return 'no cancel button';
})()
""")


def scroll_bp(host: str, port: int, bp_target: Dict, delta_y: int = 500) -> None:
    """Scroll Big Picture using Input.dispatchMouseEvent mouseWheel."""
    ws_path = ws_path_for(bp_target, port)
    sock = ws_connect(host, port, ws_path)
    try:
        cdp_call(sock, "Input.dispatchMouseEvent", {
            "type": "mouseWheel",
            "x": 640,
            "y": 400,
            "deltaX": 0,
            "deltaY": delta_y,
        }, msg_id=1)
    finally:
        sock.close()


def dismiss_bp_escape(host: str, port: int, bp_target: Dict) -> None:
    """Send Escape key to Big Picture to dismiss overlays."""
    ws_path = ws_path_for(bp_target, port)
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


# ---------------------------------------------------------------------------
# High-level capture functions
# ---------------------------------------------------------------------------

ALL_TARGETS = [
    "home", "home-shelves", "qam",
    "game-detail", "game-menu",
    "shelf-actions", "shelf-edit", "shelf-hidden",
    "shelf-delete", "shelf-import", "shelf-export",
]


def screenshot_home(host: str, port: int, bp: Dict) -> Optional[Path]:
    print("  Garantindo que está no topo e sem overlays...")
    bp_ws = ws_path_for(bp, port)
    # Scroll para o topo
    for _ in range(5):
        scroll_bp(host, port, bp, -2000)
        time.sleep(0.2)
    # Fechar overlays
    dismiss_bp_escape(host, port, bp)
    time.sleep(0.5)
    print("  Capturando Home screen...")
    return capture_bigpicture(host, port, bp, "home.png")


def screenshot_home_shelves(host: str, port: int, bp: Dict) -> Optional[Path]:
    """Scroll to top, then down to first shelf and capture."""
    bp_ws = ws_path_for(bp, port)

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

    result = capture_bigpicture(host, port, bp, "home-shelves.png")

    # Scroll back to top
    for _ in range(5):
        scroll_bp(host, port, bp, -2000)
        time.sleep(0.3)
    time.sleep(0.5)
    return result


def capture_qam_target(host: str, port: int, qam_target: Dict, filename: str) -> Optional[Path]:
    """Capture screenshot from QAM popup target using fromSurface=false."""
    ws_path = ws_path_for(qam_target, port)
    sock = ws_connect(host, port, ws_path)
    try:
        cdp_call(sock, "Page.enable", msg_id=1)
        result = cdp_call(sock, "Page.captureScreenshot", {"format": "png", "fromSurface": False}, msg_id=2)
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
    print("  Opening QAM...")
    open_qam(host, port, shared_ws)
    time.sleep(2.0)

    if qam_ws:
        print("  Navigating to Deck Shelves tab...")
        ok = click_deckshelves_tab(host, port, qam_ws)
        if ok:
            print("  Deck Shelves tab activated")
        else:
            print("  [WARN] Could not find Deck Shelves tab — capturing default QAM")
        time.sleep(1.5)

    print("  Capturing QAM...")
    # Sempre sobrescrever qam.png
    result = None
    if qam_target:
        result = capture_qam_target(host, port, qam_target, "qam.png")
    # Sempre sobrescrever, mesmo se vazio
    if not result or (result and result.stat().st_size == 0):
        print("  [WARN] QAM target capture failed, falling back to Big Picture")
        result = capture_bigpicture(host, port, bp, "qam.png")

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
    var card = document.querySelector('.ds-card[data-appid="{appid}"]');
    if (card) card.dispatchEvent(new Event('vgp_onok', {{bubbles: true}}));
}})()
""")
    time.sleep(3.0)
    result = capture_bigpicture(host, port, bp, "game-detail.png")

    print("  Navigating back to Home...")
    eval_target(host, port, ws_path_for(find_target(get_targets(host, port), "SharedJSContext"), port),
                "SteamClient.Navigation.Navigate('/library/home')")
    time.sleep(3.0)
    return result


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


def _open_qam_and_tab(host: str, port: int, shared_ws: str, qam_ws: str) -> None:
    """Open QAM and navigate to Deck Shelves tab."""
    open_qam(host, port, shared_ws)
    time.sleep(2.0)
    click_deckshelves_tab(host, port, qam_ws)
    time.sleep(1.5)


def screenshot_shelf_actions(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture shelf context menu (ellipsis button)."""
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
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


def screenshot_shelf_edit(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture Edit shelf modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Find and click the Edit menu item (matches Editar/Edit)
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1) {
            el.click(); return 'ok';
        }
    }
    var first = document.querySelector('[role=menuitem]');
    if (first) { first.click(); return 'first'; }
})()
""")
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-edit.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_hidden(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM showing a hidden shelf."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Click Hide/Ocultar
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('hide') !== -1 || t.indexOf('ocultar') !== -1) { el.click(); return 'ok'; }
    }
})()
""")
        # Force QAM refresh: close and reopen QAM/tab to ensure UI updates
        close_qam(host, port, shared_ws)
        time.sleep(1.0)
        open_qam(host, port, shared_ws)
        time.sleep(1.5)
        click_deckshelves_tab(host, port, qam_ws)
        time.sleep(2.0)  # Longer delay to ensure UI reflects hidden shelf
        # Sempre sobrescrever shelf-hidden.png
        result = None
        if qam_target:
            result = capture_qam_target(host, port, qam_target, "shelf-hidden.png")
        # Sempre sobrescrever, mesmo se vazio
        if not result or (result and result.stat().st_size == 0):
            result = capture_bigpicture(host, port, bp, "shelf-hidden.png")

        # Toggle back (Show/Mostrar)
        if click_qam_button(host, port, qam_ws, "cx=", 0):
            time.sleep(1.0)
            eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('show') !== -1 || t.indexOf('mostrar') !== -1) { el.click(); return 'ok'; }
    }
})()
""")
            time.sleep(0.5)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_delete(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture delete shelf confirmation dialog."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
    if click_qam_button(host, port, qam_ws, "cx=", 0):
        time.sleep(1.0)
        # Click Delete/Apagar (match exact text to avoid clicking wrong item)
        eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text === 'Delete' || text === 'Apagar') { el.click(); return 'ok'; }
    }
})()
""")
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-delete.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_import(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture import shelves modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
    clicked = click_qam_button(host, port, qam_ws, "M12 18v-6", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "m9 15", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-import.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find import button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_export(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture export shelves modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws)
    clicked = click_qam_button(host, port, qam_ws, "M12 12v6", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "m15 15", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-export.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find export button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    # Limpar todos os arquivos da pasta de screenshots antes de gerar novos
    screenshots_dir = PROJECT_ROOT / "assets" / "screenshots"
    if screenshots_dir.exists() and screenshots_dir.is_dir():
        for f in screenshots_dir.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                    print(f"[screenshot] Deleted old screenshot: {f.name}")
                except Exception as e:
                    print(f"[screenshot] Failed to delete {f.name}: {e}")
    parser = argparse.ArgumentParser(
        description="Take Steam Deck GamepadUI screenshots via CDP",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--host", default=os.environ.get("DECK_HOST", "localhost"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("DECK_CDP_PORT", "8081")))
    parser.add_argument("--target", choices=ALL_TARGETS + ["all"], default="all")
    args = parser.parse_args()

    print(f"[screenshot] Connecting to {args.host}:{args.port} ...")
    targets = get_targets(args.host, args.port)
    if not targets:
        print(f"ERROR: Cannot reach CDP at {args.host}:{args.port}")
        print("Make sure:")
        print("  1. CEF Remote Debugging is enabled on the Deck")
        print("  2. SSH tunnel is running: ssh -f -N -L 8081:localhost:8081 deck@steamdeck")
        return 1

    print(f"[screenshot] {len(targets)} CDP target(s)")
    for t in targets:
        print(f"  - {t.get('title', '?')} [{t.get('type', '?')}]")

    bp = find_target(targets, "Big Picture")
    shared = find_target(targets, "SharedJSContext")
    qam = find_target(targets, "QuickAccess")

    if not bp:
        print("ERROR: No 'Big Picture' target — is the Deck in GamepadUI mode?")
        return 1
    if not shared:
        print("ERROR: No 'SharedJSContext' target")
        return 1

    # --- Early validation: require at least 2 shelves and 1 game card ---
    print("\n[screenshot] Validating UI state (at least 2 shelves and 1 game card)...")
    bp_ws = ws_path_for(bp, args.port)
    shelf_count = 0
    game_count = 0
    try:
        shelf_count = eval_target(args.host, args.port, bp_ws, """
            (function() {
                var cards = Array.from(document.querySelectorAll('.ds-card'));
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
                return uniqueRows.length;
            })()
        """)
        game_count = eval_target(args.host, args.port, bp_ws, "document.querySelectorAll('.ds-card[data-appid]').length")
    except Exception as e:
        print(f"  [ERROR] Could not validate UI state: {e}")
        return 1
    if shelf_count < 2 or game_count < 1:
        print(f"\n[ERROR] UI state invalid: found {shelf_count} shelf(es), {game_count} game(s).\n")
        print("You must have at least 2 shelves and at least 1 game card visible on the Home screen.")
        print("Please create the required shelves/games and try again.")
        return 1

    shared_ws = ws_path_for(shared, args.port)
    qam_ws = ws_path_for(qam, args.port) if qam else None

    # Always capture in robust, explicit order for 'all'

    if args.target == "all":
        captured: List[Path] = []

        print("\n[screenshot] home-shelves ...")
        p = screenshot_home_shelves(args.host, args.port, bp)
        if p: captured.append(p)
        time.sleep(2.5)

        print("\n[screenshot] home ...")
        # Forçar navegação para a Home antes do print
        try:
            eval_target(args.host, args.port, shared_ws, "SteamClient.Navigation.Navigate('/library/home')")
            time.sleep(3.0)  # Espera para garantir que a Home carregue
            # Fechar overlays que possam estar abertos
            dismiss_bp_escape(args.host, args.port, bp)
            time.sleep(0.5)
        except Exception as e:
            print(f"  [WARN] Falha ao navegar para Home: {e}")
        p = screenshot_home(args.host, args.port, bp)
        if p: captured.append(p)
        time.sleep(2.5)

        print("\n[screenshot] game-menu ...")
        try:
            p = screenshot_game_menu(args.host, args.port, bp, shared_ws)
            if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] game-menu screenshot failed: {e}")
        time.sleep(1.5)

        print("\n[screenshot] qam ...")
        try:
            p = screenshot_qam(args.host, args.port, bp, shared_ws, qam_ws, qam)
            if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] QAM screenshot failed: {e}")

        print("\n[screenshot] shelf-actions ...")
        try:
            if qam_ws:
                p = screenshot_shelf_actions(args.host, args.port, bp, shared_ws, qam_ws)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-actions screenshot failed: {e}")

        print("\n[screenshot] shelf-edit ...")
        try:
            if qam_ws:
                p = screenshot_shelf_edit(args.host, args.port, bp, shared_ws, qam_ws)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-edit screenshot failed: {e}")

        print("\n[screenshot] shelf-hidden ...")
        try:
            if qam_ws:
                # Hide a shelf, capture QAM, then unhide
                p = screenshot_shelf_hidden(args.host, args.port, bp, shared_ws, qam_ws, qam)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-hidden screenshot failed: {e}")

        print("\n[screenshot] game-detail ...")
        try:
            p = screenshot_game_detail(args.host, args.port, bp, shared_ws)
            if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] game-detail screenshot failed: {e}")

        print("\n[screenshot] shelf-delete ...")
        try:
            if qam_ws:
                p = screenshot_shelf_delete(args.host, args.port, bp, shared_ws, qam_ws)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-delete screenshot failed: {e}")

        print("\n[screenshot] shelf-import ...")
        try:
            if qam_ws:
                p = screenshot_shelf_import(args.host, args.port, bp, shared_ws, qam_ws)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-import screenshot failed: {e}")

        print("\n[screenshot] shelf-export ...")
        try:
            if qam_ws:
                p = screenshot_shelf_export(args.host, args.port, bp, shared_ws, qam_ws)
                if p: captured.append(p)
        except Exception as e:
            print(f"  [ERROR] shelf-export screenshot failed: {e}")

    else:
        want = ALL_TARGETS if args.target == "all" else [args.target]
        captured: List[Path] = []
        for name in want:
            print(f"\n[screenshot] {name} ...")
            p = None
            try:
                if name == "home":
                    p = screenshot_home(args.host, args.port, bp)
                elif name == "home-shelves":
                    p = screenshot_home_shelves(args.host, args.port, bp)
                elif name == "qam":
                    p = screenshot_qam(args.host, args.port, bp, shared_ws, qam_ws, qam)
                elif name == "game-detail":
                    p = screenshot_game_detail(args.host, args.port, bp, shared_ws)
                elif name == "game-menu":
                    p = screenshot_game_menu(args.host, args.port, bp, shared_ws)
                elif name == "shelf-actions" and qam_ws:
                    p = screenshot_shelf_actions(args.host, args.port, bp, shared_ws, qam_ws)
                elif name == "shelf-edit" and qam_ws:
                    p = screenshot_shelf_edit(args.host, args.port, bp, shared_ws, qam_ws)
                elif name == "shelf-hidden" and qam_ws:
                    p = screenshot_shelf_hidden(args.host, args.port, bp, shared_ws, qam_ws, qam)
                elif name == "shelf-delete" and qam_ws:
                    p = screenshot_shelf_delete(args.host, args.port, bp, shared_ws, qam_ws)
                elif name == "shelf-import" and qam_ws:
                    p = screenshot_shelf_import(args.host, args.port, bp, shared_ws, qam_ws)
                elif name == "shelf-export" and qam_ws:
                    p = screenshot_shelf_export(args.host, args.port, bp, shared_ws, qam_ws)
                else:
                    print(f"  [WARN] Skipping {name} (requires QAM target)")
            except Exception as e:
                print(f"  [ERROR] {name} screenshot failed: {e}")
            if p:
                captured.append(p)

    if captured:
        print(f"\n[screenshot] Saved {len(captured)} screenshot(s):")
        for p in captured:
            print(f"  {p.relative_to(PROJECT_ROOT)}")
        return 0
    else:
        print("\n[screenshot] No screenshots captured.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
