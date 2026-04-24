
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


def open_mainmenu(host: str, port: int, shared_ws: str) -> bool:
    """Open Steam's main menu via SteamUIStore. Returns True if a known entry
    point was invoked. The main menu sits on top of any existing overlay, so
    after a short wait we can safely act on it to reset state."""
    JS = r"""
(function(){
    try {
        var inst = (typeof SteamUIStore !== 'undefined') && SteamUIStore.WindowStore
                   && SteamUIStore.WindowStore.GamepadUIMainWindowInstance;
        if (inst) {
            if (typeof inst.OpenMainMenu === 'function') { inst.OpenMainMenu(); return 'open-via-instance'; }
            if (typeof inst.OnMainMenuButtonPressed === 'function') { inst.OnMainMenuButtonPressed(); return 'open-via-button'; }
        }
        if (typeof MainMenuStore !== 'undefined' && typeof MainMenuStore.OpenMainMenu === 'function') {
            MainMenuStore.OpenMainMenu(); return 'open-via-store';
        }
        return 'no-entrypoint';
    } catch(e) { return 'err:' + (e && e.message ? e.message : String(e)); }
})()
"""
    try:
        res = eval_target(host, port, shared_ws, JS)
        print(f"    open_mainmenu -> {res}")
        return isinstance(res, str) and res.startswith("open-")
    except Exception as e:
        print(f"    [WARN] open_mainmenu failed: {e}")
        return False


def click_mainmenu_first_item(host: str, port: int) -> bool:
    """Click the top-most item in the Steam main menu. That item is the home
    entry (localized as 'Home'/'Início'/etc.), so activating it forcibly
    navigates to home and closes all overlays regardless of language."""
    targets = get_targets(host, port)
    mm = find_target(targets, "MainMenu")
    if not mm:
        return False
    mm_ws = ws_path_for(mm, port)
    JS = r"""
(function(){
    // Collect visible focusable/button items inside the main menu.
    var candidates = Array.from(document.querySelectorAll(
        'button, [role="button"], .Focusable, [tabindex]:not([tabindex="-1"])'
    )).filter(function(el){
        try {
            var r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 20) return false;
            var cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
            return true;
        } catch(_){ return false; }
    });
    if (!candidates.length) return 'empty';
    // Sort by top coordinate — the top-most item is the home entry.
    candidates.sort(function(a, b){
        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    candidates[0].click();
    return 'clicked:' + (candidates[0].textContent || '').trim().substring(0, 40);
})()
"""
    try:
        res = eval_target(host, port, mm_ws, JS)
        print(f"    click_mainmenu_first_item -> {res}")
        return isinstance(res, str) and res.startswith("clicked:")
    except Exception as e:
        print(f"    [WARN] click_mainmenu_first_item failed: {e}")
        return False


def ensure_bp_clean(host: str, port: int, bp: Dict, shared_ws: str) -> None:
    """Ensure Big Picture is on a clean home screen with no overlays.

    Sequence (per user spec):
      1. Open the Steam main menu
      2. Wait ~1.5s for it to render
      3. Click the first (top) item — this is the home entry regardless of
         language, so activating it forcibly lands on a clean home screen
      4. Wait 6s for the navigation to settle and overlays to dispose

    If the main-menu entry points aren't available on this Steam build,
    fall back to direct navigation + Escape sweep.
    """
    bp_ws = ws_path_for(bp, port)

    opened = open_mainmenu(host, port, shared_ws)
    if opened:
        time.sleep(1.5)
        clicked = click_mainmenu_first_item(host, port)
        if clicked:
            print("    Aguardando 6s para home estabilizar...")
            time.sleep(6.0)
            return

    # Fallback: entry points unavailable or item not clicked
    print("    [fallback] main menu unavailable — using Navigate + Escape sweep")
    try:
        eval_target(host, port, shared_ws, "SteamClient.Navigation.Navigate('/library/home')")
    except Exception:
        pass
    time.sleep(2.0)
    for _ in range(3):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.2)
    if is_mainmenu_open(host, port):
        dismiss_bp_escape(host, port, bp)
        time.sleep(0.5)
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
    except Exception:
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

# QAM popup captures (Page.captureScreenshot on the QAM popup target) should
# always come from the popup's own compositor — the Big Picture window is
# 1281×801 while the QAM popup is 522×741, and the framing is only correct
# on the popup target. We retry a few times if the first frame comes back
# zero-sized (compositor not ready), but we never fall back to Big Picture:
# substituting a BP shot for a QAM shot would hide the popup behind the
# game/home and lie about what the user actually sees.
QAM_CAPTURE_RETRIES = 3
QAM_CAPTURE_RETRY_DELAY = 0.6


def capture_qam_with_fallback(
    host: str,
    port: int,
    bp: Dict,
    qam_target: Optional[Dict],
    filename: str,
) -> Optional[Path]:
    """Capture the QAM popup target. Retries a few times on zero-size frames
    (compositor hasn't pushed yet). Returns the QAM capture in every case when
    `qam_target` is available — we do NOT fall back to Big Picture, which has
    the wrong dimensions for QAM shots. When `qam_target` is None (no popup
    window visible at all), fall back to Big Picture as last resort."""
    if not qam_target:
        return capture_bigpicture(host, port, bp, filename)
    last: Optional[Path] = None
    for attempt in range(QAM_CAPTURE_RETRIES):
        last = capture_qam_target(host, port, qam_target, filename)
        if last is not None and last.stat().st_size > 0:
            return last
        if attempt + 1 < QAM_CAPTURE_RETRIES:
            print(f"  [WARN] QAM popup capture empty (attempt {attempt + 1}); retrying in {QAM_CAPTURE_RETRY_DELAY}s")
            time.sleep(QAM_CAPTURE_RETRY_DELAY)
    return last


ALL_TARGETS = [
    "home", "home-shelves", "qam",
    "game-detail", "game-menu",
    "shelf-actions", "shelf-edit", "shelf-edit-visual", "shelf-edit-filters",
    "shelf-hidden",
    "shelf-delete", "shelf-import", "shelf-export",
    "reset-all", "about-page",
    "smart-shelves-qam", "smart-shelf-modal", "smart-shelf-edit",
    "saved-filters-qam",
    "global-toggles",
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
        result = capture_qam_with_fallback(host, port, bp, qam_target, "shelf-hidden.png")

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


def screenshot_reset_all(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture the destructive Reset-all confirmation modal.

    Reset-all is the *rightmost* icon-only DialogButton in the QAM footer row
    (Import all | Export all | Reset all). It shares the icon-only footprint
    with its siblings, so picking "widest button at bottom" picks one at
    random. Instead we locate it by the unique SVG path of the reset icon
    (`M3 12a9 9 0 1 0 3-6.7` — a circular-arrow shape) that
    `src/components/qam/icons.tsx` uses.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    # Scroll to the very bottom so the footer row is in view before clicking.
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (scope) scope.scrollTop = scope.scrollHeight;
    return 'ok';
})()
""")
    time.sleep(0.5)
    clicked = eval_target(host, port, qam_ws, r"""
(function(){
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Match the circular-arrow path unique to the reset icon in icons.tsx.
    // Use the FULL QAM scope and then pick the LAST match — that's the footer
    // reset-all button, not the per-section reset buttons higher up.
    var btns = Array.from(scope.querySelectorAll('button')).filter(function(b){
        return b.innerHTML.indexOf('M3 12a9 9 0 1 0 3-6.7') !== -1;
    });
    if (!btns.length) return 'no-reset-icon';
    var target = btns[btns.length - 1];
    target.click();
    var r = target.getBoundingClientRect();
    return 'clicked:bottom=' + Math.round(r.bottom) + ',count=' + btns.length;
})()
""")
    print(f"    reset button: {clicked}")
    if not (isinstance(clicked, str) and clicked.startswith("clicked")):
        close_qam(host, port, shared_ws)
        time.sleep(0.5)
        return None
    time.sleep(2.0)
    # ResetAllModal goes through Decky's `showModal`, which renders into the
    # Big Picture modal root (not the QAM popup). Capture BP so the
    # confirmation dialog is visible on top of the home.
    result = capture_bigpicture(host, port, bp, "reset-all.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
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


def screenshot_smart_shelves_qam(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Smart Shelves section."""
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    # Scroll the QAM scope to the smart shelves toggle
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Find the smart shelves toggle by scanning ToggleField labels
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    while (node = walker.nextNode()) {
        var txt = (node.textContent || '').trim();
        if (txt.length > 3 && txt.length < 80 &&
            (txt.toLowerCase().indexOf('smart') !== -1 || txt.toLowerCase().indexOf('prateleira') !== -1)) {
            var el = node.parentElement;
            if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'scrolled:' + txt.substring(0, 30); }
        }
    }
    // Fallback: scroll to 60% of the QAM scope height
    scope.scrollTop = Math.floor(scope.scrollHeight * 0.6);
    return 'fallback-scroll';
})()
""")
    time.sleep(1.0)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "smart-shelves-qam.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_smart_shelf_modal(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the Smart Shelf template picker modal."""
    if not qam_ws:
        return None
    bp_ws = ws_path_for(bp, port)
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    # Scroll to the bottom of the QAM scope to reveal the smart shelves add button
    eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (scope) scope.scrollTop = scope.scrollHeight;
})()
""")
    time.sleep(0.5)

    # Click add button inside the smart shelves section (smaller Focusable after SmartShelvesFirstRunBanner or list)
    clicked = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Find the button/Focusable that appears inside the smart shelves section (after smart_section_header)
    var headers = Array.from(scope.querySelectorAll('[class*="section-header"], [class*="sectionHeader"]'));
    var smartHeader = null;
    for (var h of headers) {
        var txt = (h.textContent || '').toLowerCase();
        if (txt.indexOf('smart') !== -1 || txt.indexOf('inteligente') !== -1) {
            smartHeader = h; break;
        }
    }
    if (smartHeader) {
        // Find the next sibling add button
        var sib = smartHeader.nextElementSibling;
        while (sib) {
            var btn = sib.querySelector('button, [role="button"]');
            if (btn) { btn.click(); return 'clicked-after-header'; }
            sib = sib.nextElementSibling;
        }
    }
    // Fallback: find the SmartShelvesFirstRunBanner button
    var allBtns = Array.from(scope.querySelectorAll('button'));
    // Try to find a button whose text or SVG hints at "add"
    for (var b of allBtns) {
        if (b.innerHTML.indexOf('M12 5v14') !== -1 || b.innerHTML.indexOf('M5 12h14') !== -1) {
            // Check it's in lower half of QAM
            var r = b.getBoundingClientRect();
            if (r.top > 200) { b.click(); return 'clicked-add-btn'; }
        }
    }
    return 'not-found';
})()
""")
    print(f"    smart-shelf-modal click: {clicked}")
    time.sleep(2.0)

    result = capture_bigpicture(host, port, bp, "smart-shelf-modal.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(0.5)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_global_toggles(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Apply Globally (visual_global) section.

    Visual Global is the *second-to-last* CollapsibleSection in the QAM —
    just above the Saved Filters section (which may be hidden) and the
    footer row. Scrolling blindly to `scope.scrollHeight` lands on the
    footer instead. We find the section header by the i18n title and
    scroll it to the top of the view, then ensure it's expanded.
    """
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    scroll = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    // Section titles: the visual_global i18n key is rendered localized, so
    // match by common roots across locales.
    var needles = ['apply globally', 'aplicar globalmente', 'appliquer', 'global', 'globalmente'];
    var headers = Array.from(scope.querySelectorAll('.ds-collapsible-header, [class*="collapsible-header"], [class*="section-header"]'));
    var found = null;
    for (var h of headers) {
        var t = (h.textContent || '').toLowerCase();
        if (!t) continue;
        for (var n of needles) {
            if (t.indexOf(n) !== -1) { found = h; break; }
        }
        if (found) break;
    }
    if (!found) {
        // Fallback: walk text nodes — match i18n keys for Visual / highlight.
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        var node;
        while (node = walker.nextNode()) {
            var txt = (node.textContent || '').toLowerCase();
            if (txt.indexOf('match_native') !== -1 || txt.indexOf('highlight_first') !== -1 ||
                txt.indexOf('highlight_all') !== -1 || txt.indexOf('native size') !== -1) {
                var el = node.parentElement;
                if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'fallback-toggles'; }
            }
        }
        return 'not-found';
    }
    // Ensure the section is expanded before scrolling (if the collapsible
    // renders its content conditionally, clicking the header toggles it).
    var collapsed = found.getAttribute('aria-expanded') === 'false' ||
                    found.querySelector('[class*="collapse-icon"]')?.textContent === '+' ||
                    false;
    if (collapsed) { try { found.click(); } catch(_){} }
    found.scrollIntoView({ behavior: 'instant', block: 'start' });
    return 'scrolled-to-header';
})()
""")
    print(f"    global-toggles scroll: {scroll}")
    time.sleep(1.2)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "global-toggles.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_saved_filters_qam(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, qam_target: Optional[Dict] = None) -> Optional[Path]:
    """Capture QAM scrolled to the Saved Filters section.

    Saved Filters only renders when the user has at least one saved filter —
    when empty, the CollapsibleSection is hidden entirely. The scroll helper
    scans for the section header by i18n-aware text patterns and scrolls it
    into view; if not found (no saved filters yet), returns None instead of
    writing a misleading image.
    """
    if not qam_ws:
        return None
    ok = _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not ok:
        return None

    found = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    var matches = ['saved filter', 'filtros salvos', 'filtres enregistrés', 'gespeicherte filter', 'filtros guardados'];
    while (node = walker.nextNode()) {
        var txt = (node.textContent || '').trim().toLowerCase();
        if (!txt || txt.length > 80) continue;
        for (var m of matches) {
            if (txt.indexOf(m) !== -1) {
                var el = node.parentElement;
                while (el && el.parentElement !== scope && el.parentElement) el = el.parentElement;
                if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); return 'scrolled:' + txt; }
            }
        }
    }
    return 'not-found';
})()
""")
    print(f"    saved-filters scroll: {found}")
    if not (isinstance(found, str) and found.startswith("scrolled:")):
        close_qam(host, port, shared_ws)
        time.sleep(0.3)
        print("  [SKIP] Saved Filters section is hidden (no saved filters configured)")
        return None
    time.sleep(1.0)

    result = capture_qam_with_fallback(host, port, bp, qam_target, "saved-filters-qam.png")

    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_shelf_edit_tab(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str, tab_label: str, filename: str) -> Optional[Path]:
    """Open the Edit shelf modal and activate a specific tab (Visual / Filters / Source / Display).

    The tab bar is rendered by Decky's `Tabs` component; each tab is a
    Focusable with its label text. We click the tab whose textContent matches
    `tab_label` (case-insensitive, i18n-aware list of aliases) before capture.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    if not click_qam_button(host, port, qam_ws, "cx=", 0):
        close_qam(host, port, shared_ws)
        return None
    time.sleep(1.0)
    eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1 || text.indexOf('Modifier') !== -1 || text.indexOf('Bearbeiten') !== -1) {
            el.click(); return 'ok';
        }
    }
    var first = document.querySelector('[role=menuitem]');
    if (first) { first.click(); return 'first'; }
})()
""")
    time.sleep(2.0)
    click = eval_target(host, port, bp_ws, f"""
(function() {{
    var needle = {json.dumps(tab_label.lower())};
    var tabs = Array.from(document.querySelectorAll('[role="tab"], [class*="tab-bar-entry"], [class*="TabBar"] .Focusable, [class*="tabs_"] .Focusable'));
    for (var t of tabs) {{
        var txt = (t.textContent || '').trim().toLowerCase();
        if (!txt) continue;
        if (txt.indexOf(needle) !== -1) {{ t.click(); return 'clicked:' + txt; }}
    }}
    return 'not-found';
}})()
""")
    print(f"    tab click ({tab_label}): {click}")
    time.sleep(1.5)
    result = capture_bigpicture(host, port, bp, filename)
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
    close_qam(host, port, shared_ws)
    time.sleep(0.5)
    return result


def screenshot_smart_shelf_edit(host: str, port: int, bp: Dict, shared_ws: str, qam_ws: str) -> Optional[Path]:
    """Capture the Edit Smart Shelf modal.

    Strategy: open QAM, scroll to the Smart Shelves list, click the ⋯ button
    on the first enabled smart shelf row, then click Edit / Editar. Returns
    None when Smart Shelves are disabled or no entries are enabled — the
    modal wouldn't be reachable in that state.
    """
    bp_ws = ws_path_for(bp, port)
    _open_qam_and_tab(host, port, shared_ws, qam_ws, bp)
    eval_target(host, port, qam_ws, """
(function() {
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
    time.sleep(1.0)
    # Click the ⋯ button on the FIRST smart shelf row (they come after the regular shelves).
    clicked = eval_target(host, port, qam_ws, """
(function() {
    var scope = document.querySelector('.deck-shelves-qam-scope');
    if (!scope) return 'no-scope';
    var btns = Array.from(scope.querySelectorAll('button')).filter(b => b.innerHTML.indexOf('cx=') !== -1);
    // Heuristic: the LAST ⋯ in the scope is the one on the last row (smart shelf) most of the time;
    // fall back to clicking the ⋯ that sits below the smart header (positional).
    if (!btns.length) return 'no-ellipsis';
    var last = btns[btns.length - 1];
    last.click();
    return 'clicked-last';
})()
""")
    print(f"    smart-shelf ellipsis: {clicked}")
    if clicked != 'clicked-last':
        close_qam(host, port, shared_ws)
        return None
    time.sleep(1.0)
    eval_target(host, port, bp_ws, """
(function() {
    var items = document.querySelectorAll('[class*=_MenuItem], [class*=contextMenuItem], [role=menuitem]');
    for (var el of items) {
        var text = (el.textContent || '').trim();
        if (text.indexOf('Edit') !== -1 || text.indexOf('Editar') !== -1 || text.indexOf('Modifier') !== -1 || text.indexOf('Bearbeiten') !== -1) {
            el.click(); return 'ok';
        }
    }
})()
""")
    time.sleep(2.0)
    result = capture_bigpicture(host, port, bp, "smart-shelf-edit.png")
    cancel_bp_modal(host, port, bp_ws)
    time.sleep(1.0)
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






    bp_ws = ws_path_for(bp, args.port)

    # HOME: ensure_bp_clean already navigates to the top of home via main menu.
    # Do NOT send mouseWheel events here — they trigger card hover states
    # (label + brightness + shadow) which become the "overlay" on capture.
    print("\n[screenshot] home ...")
    ensure_bp_clean(args.host, args.port, bp, shared_ws)
    # Force scrollTop=0 on the home scrollable via JS (no mouse events → no hover)
    eval_target(args.host, args.port, bp_ws, """
(function(){
    var mount = document.getElementById('deck-shelves-home-root');
    var cur = mount ? mount.parentElement : null;
    while (cur) {
        try {
            var cs = getComputedStyle(cur);
            var oy = (cs.overflowY || '').toLowerCase();
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) {
                cur.scrollTop = 0; return 'scrolled';
            }
        } catch(_){}
        cur = cur.parentElement;
    }
    return 'no-scrollable';
})()
""")
    time.sleep(1.0)
    p = capture_bigpicture(args.host, args.port, bp, "home.png")
    if p:
        captured.append(p)
        explicacoes.append(("home.png", "Tela inicial da Steam Deck mostrando as prateleiras personalizadas do plugin Deck Shelves."))
    time.sleep(1.2)

    # HOME-SHELVES: scroll directly via JS to the second shelf. mouseWheel
    # events would hover the card under (640,400) and pollute the capture.
    print("\n[screenshot] home-shelves ... (segunda prateleira)")
    scrolled = eval_target(args.host, args.port, bp_ws, """
(function(){
    var shelves = Array.from(document.querySelectorAll('.ds-shelf'));
    if (shelves.length < 2) return { err: 'fewer-than-2-shelves', count: shelves.length };
    // Find the nearest scrollable ancestor
    var mount = document.getElementById('deck-shelves-home-root');
    var scr = mount ? mount.parentElement : null;
    while (scr) {
        try {
            var cs = getComputedStyle(scr);
            var oy = (cs.overflowY || '').toLowerCase();
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && scr.scrollHeight > scr.clientHeight) break;
        } catch(_){}
        scr = scr.parentElement;
    }
    if (!scr) return { err: 'no-scrollable' };
    var shelf = shelves[1];
    var shelfRect = shelf.getBoundingClientRect();
    var scrRect = scr.getBoundingClientRect();
    // Land the second shelf ~200px below the top of the viewport
    var target = Math.max(0, Math.round(scr.scrollTop + (shelfRect.top - scrRect.top) - 200));
    scr.scrollTop = target;
    return { ok: true, scrollTop: scr.scrollTop };
})()
""")
    print(f"  scroll result: {scrolled}")
    time.sleep(1.5)
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
            explicacoes.append(("shelf-edit.png", "Modal de edição de prateleira (aba Source)."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-edit-filters ... (aba Filters com SavedFiltersBar)")
    if qam_ws:
        p = screenshot_shelf_edit_tab(args.host, args.port, bp, shared_ws, qam_ws, "filter", "shelf-edit-filters.png")
        if p:
            captured.append(p)
            explicacoes.append(("shelf-edit-filters.png", "Aba Filters da edição de prateleira — FilterPanel + SavedFiltersBar no topo."))
        time.sleep(1.5)

    print("\n[screenshot] shelf-edit-visual ... (aba Visual com highlight picker)")
    if qam_ws:
        p = screenshot_shelf_edit_tab(args.host, args.port, bp, shared_ws, qam_ws, "visual", "shelf-edit-visual.png")
        if p:
            captured.append(p)
            explicacoes.append(("shelf-edit-visual.png", "Aba Visual da edição — toggles de highlight + mini-preview + padrões Odd/Even."))
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

    print("\n[screenshot] reset-all ... (confirmação destrutiva)")
    if qam_ws:
        p = screenshot_reset_all(args.host, args.port, bp, shared_ws, qam_ws, qam)
        if p:
            captured.append(p)
            explicacoes.append(("reset-all.png", "Confirmação do botão Reset all (ícone circular-arrow à direita do rodapé)."))
        time.sleep(1.5)

    print("\n[screenshot] about-page ...")
    if qam_ws:
        p = screenshot_about_page(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("about-page.png", "Página About com documentação de filtros."))
        time.sleep(1.5)

    print("\n[screenshot] smart-shelves-qam ...")
    if qam_ws:
        p = screenshot_smart_shelves_qam(args.host, args.port, bp, shared_ws, qam_ws, qam)
        if p:
            captured.append(p)
            explicacoes.append(("smart-shelves-qam.png", "Seção de Smart Shelves no QAM do plugin."))
        time.sleep(1.5)

    print("\n[screenshot] smart-shelf-modal ...")
    if qam_ws:
        p = screenshot_smart_shelf_modal(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("smart-shelf-modal.png", "Modal de seleção de template para Smart Shelf."))
        time.sleep(1.5)

    print("\n[screenshot] smart-shelf-edit ... (EditSmartShelfModal)")
    if qam_ws:
        p = screenshot_smart_shelf_edit(args.host, args.port, bp, shared_ws, qam_ws)
        if p:
            captured.append(p)
            explicacoes.append(("smart-shelf-edit.png", "Edição de Smart Shelf — sort override, filtros adicionais e toggles visuais."))
        time.sleep(1.5)

    print("\n[screenshot] saved-filters-qam ... (seção Saved Filters no QAM)")
    if qam_ws:
        p = screenshot_saved_filters_qam(args.host, args.port, bp, shared_ws, qam_ws, qam)
        if p:
            captured.append(p)
            explicacoes.append(("saved-filters-qam.png", "Seção Saved Filters no QAM (oculta quando não há filtros salvos)."))
        time.sleep(1.5)

    print("\n[screenshot] global-toggles ...")
    if qam_ws:
        p = screenshot_global_toggles(args.host, args.port, bp, shared_ws, qam_ws, qam)
        if p:
            captured.append(p)
            explicacoes.append(("global-toggles.png", "Seção de toggles globais no QAM do plugin."))
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
