
#!/usr/bin/env python3
import sys
import argparse
import base64
import json
import os
import socket
import struct
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

def capture_bigpicture(host: str, port: int, bp_target: dict, filename: str) -> Optional[Path]:
    """Capture screenshot from Big Picture target using Page.captureScreenshot."""

    ws_path = ws_path_for(bp_target, port)
    sock = ws_connect(host, port, ws_path)
    try:
        cdp_call(sock, "Page.enable", msg_id=1)
        result = cdp_call(sock, "Page.captureScreenshot", {"format": "png"}, msg_id=2)
        data = result.get("result", {}).get("data", "")
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
def get_targets(host: str, port: int) -> list:
    """Fetch all CDP targets from the remote debug endpoint."""
    import urllib.request
    url = f"http://{host}:{port}/json"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.load(resp)
    except Exception as e:
        print(f"[get_targets] Failed to fetch targets: {e}")
        return []

def find_target(targets: list, title_substring: str) -> Optional[dict]:
    """Find a target whose title contains the given substring."""
    for t in targets:
        if title_substring.lower() in t.get("title", "").lower():
            return t
    return None

import sys
import argparse
import base64
import json
import os
import socket
import struct

OPEN_QAM_EXPR = """
(function() {
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


def ws_path_for(target: dict, port: int) -> str:
    wsurl = target.get("webSocketDebuggerUrl", "") or ""
    wsurl = wsurl.replace("wss://", "ws://")
    return wsurl.split(f"{port}", 1)[1]


def _normalize_host(host: str) -> str:
    """Strip any leading scheme (http://, https://, ws://, wss://) from host."""
    if not host:
        return host
    for prefix in ("http://", "https://", "ws://", "wss://"):
        if host.startswith(prefix):
            return host[len(prefix):]
    return host

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "assets" / "screenshots"


# ---------------------------------------------------------------------------
# WebSocket / CDP helpers
# ---------------------------------------------------------------------------

def ws_connect(host: str, port: int, path: str) -> socket.socket:
    host = _normalize_host(host)
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
    # cdp_eval was incorrectly nested here; moved to top-level below
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

# Top-level cdp_eval function
def cdp_eval(sock: socket.socket, expression: str, msg_id: int = 1) -> any:
    result = cdp_call(sock, "Runtime.evaluate", {"expression": expression, "returnByValue": True}, msg_id)
    return result.get("result", {}).get("result", {}).get("value")


def cdp_call(sock: socket.socket, method: str, params: Optional[Dict] = None, msg_id: int = 1) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"id": msg_id, "method": method}
    if params:
        payload["params"] = params
    ws_send(sock, json.dumps(payload))
    while True:
        resp = ws_recv(sock)
        if not resp:
            continue
        msg = json.loads(resp)
        if msg.get("id") == msg_id:
            return msg
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




def eval_target(host: str, port: int, ws_path: str, expression: str, msg_id: int = 1) -> Any:
    """Evaluate JS in any CDP target and return the result value."""
    sock = ws_connect(host, port, ws_path)
    try:
        return cdp_eval(sock, expression, msg_id)
    finally:
        sock.close()


def apply_english_locale(host: str, port: int, shared_ws: str) -> bool:
        """Try to switch the UI language to English using i18next."""
        JS = r"""
(function(){
    try{
        if (typeof i18next !== 'undefined' && i18next.changeLanguage) {
            try { i18next.changeLanguage('en-US'); } catch(e){}
        }
        // Also set lang attribute as a best-effort fallback
        try { document.documentElement.lang = 'en-US'; } catch(e){}
        return 'requested';
    }catch(e){ return 'err:'+ (e && e.message ? e.message : String(e)); }
})()
"""
        try:
            res = eval_target(host, port, shared_ws, JS)
            print(f"  apply_english_locale -> {res}")
        except Exception as e:
            print(f"  [WARN] apply_english_locale request failed: {e}")
            return False

        # Poll for the language to be reported as en-US (give it a few seconds)
        deadline = time.time() + 15.0
        while time.time() < deadline:
            try:
                cur = eval_target(host, port, shared_ws, "(function(){ return (typeof i18next !== 'undefined' && i18next.language) ? i18next.language : document.documentElement.lang; })()")
                if isinstance(cur, str) and cur.lower().startswith('en'):
                    try:
                        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                        marker = OUTPUT_DIR / '.lang-applied'
                        marker.write_text('en-US')
                    except Exception:
                        pass
                    print(f"  Language confirmed: {cur}")
                    return True
            except Exception:
                pass
            time.sleep(0.5)
        print("  [WARN] Language change to en-US not confirmed within timeout")
        return False

def check_cdp_reachable(host: str, port: int) -> bool:
    """Quick check that the CDP HTTP endpoint responds and returns targets."""
    try:
        targets = get_targets(host, port)
        if not targets:
            print(f"  [WARN] No CDP targets returned from {host}:{port}")
            return False
        return True
    except Exception as e:
        print(f"  [WARN] check_cdp_reachable exception: {e}")
        return False


def open_qam(host: str, port: int, shared_ws: str) -> None:
    eval_target(host, port, shared_ws, OPEN_QAM_EXPR)


def is_qam_open(host: str, port: int, bp_ws: str) -> bool:
    """Check if the QAM panel is currently visible in Big Picture."""
    try:
        result = eval_target(host, port, bp_ws, """
        (function() {
            var qam = document.querySelector('[class*="QuickAccessMenu"], [class*="quickaccessmenu"]');
            if (qam) {
                var cs = getComputedStyle(qam);
                return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
            }
            return false;
        })()
        """)
        return result is True
    except:
        return False


def close_qam(host: str, port: int, shared_ws: str) -> None:
    """Close QAM by toggling it off."""
    open_qam(host, port, shared_ws)  # toggle


def navigate_to_deckshelves_qam(host: str, port: int, qam_ws: str) -> bool:
    """Navigate to the Deck Shelves plugin inside the QAM.

    Strategy:
    1. Check if Deck Shelves QAM scope is already visible — if so, done
    2. Click the Decky plugins tab (identified by the plug SVG icon containing 'M320')
    3. Wait for the plugin list to render
    4. Find a Focusable element with exact text "Deck Shelves" and click it
    5. Verify our QAM scope rendered

    Returns True on success, False if Deck Shelves could not be found.
    """
    # Step 0: Already open?
    scope = eval_target(host, port, qam_ws, "!!document.querySelector('.deck-shelves-qam-scope')")
    if scope:
        print("    Deck Shelves QAM already active")
        return True

    # Step 1: Click the Decky plugins tab (plug icon with SVG path M320)
    result = eval_target(host, port, qam_ws, """
    (function() {
        var tabs = Array.from(document.querySelectorAll('[role=tab]'));
        if (!tabs.length) return 'no tabs';
        // Find the Decky tab by its plug/socket SVG icon
        for (var i = tabs.length - 1; i >= 0; i--) {
            var svg = tabs[i].querySelector('svg');
            if (svg && svg.innerHTML.indexOf('M320') !== -1) {
                tabs[i].click();
                return 'clicked decky tab (index ' + i + ')';
            }
        }
        // Fallback: try the last tab
        tabs[tabs.length - 1].click();
        return 'clicked last tab (fallback)';
    })()
    """)
    print(f"    Step 1 (Decky tab): {result}")
    time.sleep(2.0)

    # Step 1b: Check if clicking the Decky tab directly opened our plugin
    scope = eval_target(host, port, qam_ws, "!!document.querySelector('.deck-shelves-qam-scope')")
    if scope:
        print("    Deck Shelves QAM active after Decky tab click")
        return True

    # Step 2: Find "Deck Shelves" in the plugin list
    # The Decky QAM renders each plugin as: Focusable DIV > wrapper > BUTTON.DialogButton > DIV > "Plugin Name"
    # We must click the BUTTON (not the outer Focusable wrapper).
    for attempt in range(3):
        result = eval_target(host, port, qam_ws, """
        (function() {
            // Strategy: find text node "Deck Shelves", walk up to the nearest BUTTON, click it
            var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            var node;
            while (node = walker.nextNode()) {
                if (node.textContent.trim() === 'Deck Shelves') {
                    var el = node.parentElement;
                    // Walk up to find the nearest button
                    for (var i = 0; i < 5 && el; i++) {
                        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
                            el.click();
                            return 'clicked BUTTON: ' + el.className.substring(0, 30);
                        }
                        el = el.parentElement;
                    }
                    // Fallback: click the closest Focusable
                    el = node.parentElement;
                    for (var i = 0; i < 8 && el; i++) {
                        if (el.classList && el.classList.contains('Focusable')) {
                            el.click();
                            return 'clicked Focusable: ' + el.className.substring(0, 30);
                        }
                        el = el.parentElement;
                    }
                    return 'found text but no clickable parent';
                }
            }
            return 'not found';
        })()
        """)
        print(f"    Step 2 (find plugin, attempt {attempt + 1}): {result}")

        if 'not found' in str(result):
            # Try scrolling the plugin list down
            eval_target(host, port, qam_ws, """
            (function() {
                var panels = document.querySelectorAll('[class*=scroll], [style*=overflow]');
                for (var p of panels) {
                    if (p.scrollHeight > p.clientHeight) { p.scrollTop += 200; return; }
                }
            })()
            """)
            time.sleep(1.0)
            continue

        time.sleep(1.5)
        scope = eval_target(host, port, qam_ws, "!!document.querySelector('.deck-shelves-qam-scope')")
        if scope:
            print("    Deck Shelves QAM scope confirmed")
            return True
        # Maybe the click opened something else — try again
        time.sleep(0.5)

    print("    [ERROR] Could not find or activate Deck Shelves in QAM after 3 attempts")
    return False


# Legacy alias
def click_deckshelves_tab(host: str, port: int, qam_ws: str) -> bool:
    return navigate_to_deckshelves_qam(host, port, qam_ws)


def is_mainmenu_open(host: str, port: int) -> bool:
    """Check if the Steam main menu (Steam button) is open by inspecting its CDP target."""
    try:
        targets = get_targets(host, port)
        mm = find_target(targets, "MainMenu")
        if not mm:
            return False
        mm_ws = ws_path_for(mm, port)
        result = eval_target(host, port, mm_ws, """
        (function() {
            var el = document.querySelector('[class*="mainmenu"], [class*="MainMenu"], [class*="PowerMenu"]');
            if (el) {
                var r = el.getBoundingClientRect();
                return r.height > 50;
            }
            // Check if body has visible content beyond the empty shell
            return document.body.scrollHeight > 100 && document.querySelectorAll('button').length > 2;
        })()
        """)
        return result is True
    except:
        return False


def close_mainmenu(host: str, port: int, bp: Dict) -> None:
    """Close the Steam main menu by sending Escape to Big Picture."""
    for _ in range(3):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.3)


def ensure_bp_clean(host: str, port: int, bp: Dict, shared_ws: str) -> None:
    """Ensure Big Picture is clean: no QAM, no MainMenu, no overlays, on library/home."""
    # Navigate to home first — this closes most overlays automatically
    try:
        eval_target(host, port, shared_ws, "SteamClient.Navigation.Navigate('/library/home')")
    except:
        pass
    time.sleep(2.0)

    # Send a few Escapes to dismiss any remaining modals/menus
    for _ in range(3):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.25)

    # Check if MainMenu got opened by Escape and close it
    if is_mainmenu_open(host, port):
        print("    [clean] MainMenu open, dismissing...")
        # One more Escape closes the MainMenu
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.5)

    # Verify we're on a clean home
    bp_ws = ws_path_for(bp, port)
    try:
        on_home = eval_target(host, port, bp_ws, """
        (function() {
            return !!(document.querySelector('.ds-card') ||
                      document.querySelector('[aria-label*="ecent"]') ||
                      document.querySelector('[class*="libraryhome"]'));
        })()
        """)
        if not on_home:
            eval_target(host, port, shared_ws, "SteamClient.Navigation.Navigate('/library/home')")
            time.sleep(2.0)
    except:
        pass

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
    "about-page",
]


def screenshot_home(host: str, port: int, bp: Dict) -> Optional[Path]:
    print("  Garantindo que está no topo e sem overlays...")
    bp_ws = ws_path_for(bp, port)
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


def screenshot_shelf_edit(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture Edit shelf modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
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
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
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
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
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


def screenshot_create_shelf(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the template picker modal (create shelf)."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the "+" (add) button — SVG contains "M12 5v14" (vertical bar of plus)
    clicked = click_qam_button(host, port, qam_ws, "M12 5v14", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "M5 12h14", 0)
    if clicked:
        time.sleep(2.0)
        result = capture_bigpicture(host, port, bp, "shelf-create.png")
        cancel_bp_modal(host, port, bp_ws)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find add/create button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_import_shelf(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the import modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the import button — SVG contains "M12 18v-6" (down arrow)
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


def screenshot_shelf_import(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture import shelves modal."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
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
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
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


def screenshot_about_page(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the About / Filter Documentation page."""
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Click the book icon button (About) in the QAM title bar
    clicked = click_qam_button(host, port, qam_ws, "M4 19.5A2.5", 0)
    if not clicked:
        clicked = click_qam_button(host, port, qam_ws, "M4 4.5v15", 0)
    if clicked:
        time.sleep(2.5)
        result = capture_bigpicture(host, port, bp, "about-page.png")
        # Press Escape to close the about page
        dismiss_bp_escape(host, port, bp)
        time.sleep(1.0)
    else:
        print("  [WARN] Could not find About button")
        result = None
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    explicacoes = []
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

    # Attempt to switch UI to English and rename shelf titles before capturing
    if shared:
        try:
            shared_ws_try = ws_path_for(shared, args.port)
            apply_english_locale(args.host, args.port, shared_ws_try)
        except Exception as e:
            print(f"  [WARN] apply_english_locale exception: {e}")

    if not bp:
        print("ERROR: No 'Big Picture' target — is the Deck in GamepadUI mode?")
        return 1
    if not shared:
        print("ERROR: No 'SharedJSContext' target")
        return 1

    # Only delete existing screenshots after we've successfully verified CDP/SSH targets
    try:
        screenshots_dir = PROJECT_ROOT / "assets" / "screenshots"
        if screenshots_dir.exists() and screenshots_dir.is_dir():
            for f in screenshots_dir.iterdir():
                if f.is_file():
                    try:
                        f.unlink()
                        print(f"[screenshot] Deleted old screenshot: {f.name}")
                    except Exception as e:
                        print(f"[screenshot] Failed to delete {f.name}: {e}")
    except Exception as e:
        print(f"[WARN] Could not clear screenshots directory: {e}")

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

    captured: List[Path] = []






    # HOME: Ensure clean state, navigate to home, scroll to top
    print("\n[screenshot] home ...")
    ensure_bp_clean(args.host, args.port, bp, shared_ws)
    for _ in range(6):
        scroll_bp(args.host, args.port, bp, -2000)
        time.sleep(0.15)
    time.sleep(1.0)
    p = capture_bigpicture(args.host, args.port, bp, "home.png")
    if p:
        captured.append(p)
        explicacoes.append(("home.png", "Tela inicial da Steam Deck mostrando as prateleiras personalizadas do plugin Deck Shelves."))
    time.sleep(1.2)

    # HOME-SHELVES: Scroll até a segunda prateleira, overlays fechados, print
    print("\n[screenshot] home-shelves ... (segunda prateleira)")
    bp_ws = ws_path_for(bp, args.port)
    shelf_rows = eval_target(args.host, args.port, bp_ws, """
(function() {
    var cards = Array.from(document.querySelectorAll('.ds-card'));
    if (cards.length < 2) return null;
    var rows = cards.map(card => card.closest('[class*=HorizontalScroll], [class*=Row]') || card.parentElement);
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
        return 1
    row_top = shelf_rows[1]
    target_y = 200
    scroll_needed = int(row_top - target_y)
    if scroll_needed > 50:
        steps = max(1, scroll_needed // 300)
        per_step = scroll_needed // steps
        for _ in range(steps):
            scroll_bp(args.host, args.port, bp, per_step)
            time.sleep(0.25)
        time.sleep(2.0)
    else:
        time.sleep(1.0)
    for _ in range(6):
        dismiss_bp_escape(args.host, args.port, bp)
        time.sleep(0.15)
    p = capture_bigpicture(args.host, args.port, bp, "home-shelves.png")
    if p:
        captured.append(p)
        explicacoes.append(("home-shelves.png", "Home descida até a segunda prateleira, mostrando mais detalhes das coleções."))
    time.sleep(1.2)


    print("\n[screenshot] game-detail ... (primeira prateleira)")
    screenshot_game_detail(args.host, args.port, bp, shared_ws)
    time.sleep(2.0)

    ensure_bp_clean(args.host, args.port, bp, shared_ws)

    print("\n[screenshot] game-menu ... (segunda prateleira)")
    p = screenshot_game_menu(args.host, args.port, bp, shared_ws)
    if p:
        captured.append(p)
        explicacoes.append(("game-menu.png", "Menu de contexto do primeiro jogo da segunda prateleira (botão menu)."))
    time.sleep(2.0)

    print("\n[screenshot] qam ...")
    p = screenshot_qam(args.host, args.port, bp, shared_ws, qam_ws, qam)
    if p:
        captured.append(p)
        explicacoes.append(("qam.png", "Quick Access Menu aberto na aba do plugin Deck Shelves."))
    time.sleep(2.0)

    print("\n[screenshot] shelf-create ... (template picker)")
    if qam_ws:
        p = screenshot_create_shelf(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-create.png", "Modal de criação de prateleira (seleção de template)."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-import-modal ... (import modal)")
    if qam_ws:
        p = screenshot_import_shelf(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-import.png", "Modal de importação de prateleiras."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-hidden ... (ocultando prateleira)")
    if qam_ws:
        p = screenshot_shelf_hidden(args.host, args.port, bp, shared_ws, qam_ws, qam)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-hidden.png", "Prateleira oculta via menu do plugin (QAM)."))
        time.sleep(2.0)

    print("\n[screenshot] shelf-actions ...")
    if qam_ws:
        p = screenshot_shelf_actions(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-actions.png", "Menu de ações da prateleira (reticências)."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-edit ...")
    if qam_ws:
        p = screenshot_shelf_edit(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-edit.png", "Modal de edição de prateleira."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-delete ...")
    if qam_ws:
        p = screenshot_shelf_delete(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-delete.png", "Confirmação de exclusão de prateleira."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-export ...")
    if qam_ws:
        p = screenshot_shelf_export(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("shelf-export.png", "Modal de exportação de prateleiras."))
        time.sleep(1.5)

    print("\n[screenshot] about-page ...")
    if qam_ws:
        p = screenshot_about_page(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("about-page.png", "Página About com documentação de filtros."))
        time.sleep(1.5)

    if captured:
        print(f"\n[screenshot] Saved {len(captured)} screenshot(s):")
        for p in captured:
            print(f"  {p.relative_to(PROJECT_ROOT)}")
        print("\nExplicações das imagens geradas:")
        for fname, texto in explicacoes:
            print(f"- {fname}: {texto}")
        return 0
    else:
        print("\n[screenshot] No screenshots captured.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
