#!/usr/bin/env python3
"""Steam Deck CDP probe utilities.

Usage:
  python3 cdp_probe.py --mode mount
  python3 cdp_probe.py --mode rows
  python3 cdp_probe.py --mode smoke
"""

import argparse
import base64
import json
import os
import socket
import struct
import sys
import time
from typing import Any, Dict, List, Optional

WS_HOST = os.getenv('DECK_CDP_HOST', '127.0.0.1')
WS_PORT = int(os.getenv('DECK_CDP_PORT', '8081'))


def ws_connect(path: str) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((WS_HOST, WS_PORT))

    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {WS_HOST}:{WS_PORT}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())

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
        chunk = sock.recv(65536)
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


def cdp_eval(sock: socket.socket, expression: str, msg_id: int = 1) -> Dict[str, Any]:
    payload = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {"expression": expression, "returnByValue": True},
    }
    ws_send(sock, json.dumps(payload))
    while True:
        raw = ws_recv(sock)
        if raw is None:
            raise RuntimeError("No CDP response")
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            return msg


def get_targets() -> List[Dict[str, Any]]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((WS_HOST, WS_PORT))
    sock.sendall((f"GET /json HTTP/1.1\r\nHost: {WS_HOST}:{WS_PORT}\r\n\r\n").encode())
    resp = b""
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
        except Exception:
            break
    sock.close()

    if b"\r\n\r\n" not in resp:
        return []
    body = resp.split(b"\r\n\r\n", 1)[1]
    try:
        return json.loads(body)
    except Exception:
        return []


def find_shared_target(targets: List[Dict[str, Any]]) -> Dict[str, Any]:
    for target in targets:
        if "SharedJSContext" in target.get("title", ""):
            return target
    raise RuntimeError("SharedJSContext target not found")


def eval_in_shared(expression: str) -> Any:
    shared = None
    for _ in range(30):
        targets = get_targets()
        if targets:
            try:
                shared = find_shared_target(targets)
                break
            except Exception:
                pass
        time.sleep(1)

    if not shared:
        raise RuntimeError("SharedJSContext target not available")

    ws_path = shared["webSocketDebuggerUrl"].split(f"{WS_HOST}:{WS_PORT}", 1)[1]
    last_error: Optional[Exception] = None
    for _ in range(30):
        sock: Optional[socket.socket] = None
        try:
            sock = ws_connect(ws_path)
            msg = cdp_eval(sock, expression, 1)
            return msg.get("result", {}).get("result", {}).get("value")
        except Exception as exc:
            last_error = exc
            time.sleep(1)
        finally:
            try:
                if sock:
                    sock.close()
            except Exception:
                pass

    if last_error:
        raise last_error
    raise RuntimeError("Failed to evaluate expression in SharedJSContext")


MOUNT_EXPR = r"""
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var mount = doc.getElementById('deck-shelves-home-root');
    var viewport = doc.querySelector('._3PhGYbMWIcIaZCfllWN19N');
    var news = doc.querySelector('.cE1SaW6jrVUDxcqRtyMo1');
    if (!mount || !viewport) {
      return JSON.stringify({ hasMount: !!mount, hasViewport: !!viewport });
    }

    var children = Array.from(viewport.children);
    var mountIdx = children.indexOf(mount);
    var newsIdx = news ? children.indexOf(news) : -1;

    return JSON.stringify({
      hasMount: true,
      hasViewport: true,
      mountParentClass: mount.parentElement ? mount.parentElement.className : null,
      mountIdx: mountIdx,
      newsIdx: newsIdx,
      mountBeforeNews: news ? mountIdx > -1 && newsIdx > -1 && mountIdx < newsIdx : null,
      viewportChildren: children.map(function(c){ return c.className; })
    });
  } catch (e) {
    return JSON.stringify({ error: e.message, stack: e.stack });
  }
})()
"""

ROWS_EXPR = r"""
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var mount = doc.getElementById('deck-shelves-home-root');
    if (!mount) return JSON.stringify({ hasMount: false });

    var rows = Array.from(mount.querySelectorAll('.ds-row-scroll'));
    return JSON.stringify({
      hasMount: true,
      rowCount: rows.length,
      rows: rows.map(function(row) {
        var title = row.previousElementSibling ? row.previousElementSibling.textContent.trim() : null;
        return {
          title: title,
          cards: row.querySelectorAll('.ds-card').length,
          hasMoreCard: !!Array.from(row.querySelectorAll('.ds-card')).find(function(card) {
            return (card.textContent || '').toLowerCase().includes('ver mais') || (card.textContent || '').toLowerCase().includes('view more');
          })
        };
      })
    });
  } catch (e) {
    return JSON.stringify({ error: e.message, stack: e.stack });
  }
})()
"""


SMOKE_EXPR = r"""
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var mount = doc.getElementById('deck-shelves-home-root');
    var viewport = doc.querySelector('._3PhGYbMWIcIaZCfllWN19N');
    var news = doc.querySelector('.cE1SaW6jrVUDxcqRtyMo1');
    var rows = mount ? Array.from(mount.querySelectorAll('.ds-row-scroll')) : [];
    var cards = mount ? mount.querySelectorAll('.ds-card').length : 0;
    var focusedCards = mount ? mount.querySelectorAll('.ds-card.gpfocus').length : 0;

    var pass = true;
    var failures = [];

    if (!mount) { pass = false; failures.push('mount-missing'); }
    if (!viewport) { pass = false; failures.push('viewport-missing'); }
    if (mount && viewport && news) {
      var children = Array.from(viewport.children);
      var mountIdx = children.indexOf(mount);
      var newsIdx = children.indexOf(news);
      if (!(mountIdx > -1 && newsIdx > -1 && mountIdx < newsIdx)) {
        pass = false;
        failures.push('mount-not-before-news');
      }
    }
    if (rows.length === 0) { pass = false; failures.push('no-rows'); }
    if (cards === 0) { pass = false; failures.push('no-cards'); }

    return JSON.stringify({
      pass: pass,
      failures: failures,
      rowCount: rows.length,
      cardCount: cards,
      focusedCards: focusedCards
    });
  } catch (e) {
    return JSON.stringify({ pass: false, failures: ['exception'], error: e.message, stack: e.stack });
  }
})()
"""


FOCUS_EXPR = r"""
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var mount = doc.getElementById('deck-shelves-home-root');
    var out = {};

    // 1. Check FocusNavController
    var ctrl = window.FocusNavController || (window.GamepadNavTree && window.GamepadNavTree.m_context && window.GamepadNavTree.m_context.m_controller);
    out.hasController = !!ctrl;

    // 2. Check navigation trees
    var context = ctrl && (ctrl.m_ActiveContext || ctrl.m_LastActiveContext);
    var trees = (context && context.m_rgGamepadNavigationTrees) || [];
    out.treeCount = trees.length;

    // 3. Recursively walk the GamepadUI_Full_Root tree to understand its structure
    var mainTree = null;
    for (var ti = 0; ti < trees.length; ti++) {
      if (trees[ti].m_ID === 'GamepadUI_Full_Root') { mainTree = trees[ti]; break; }
    }

    function describeNode(node, depth, maxDepth) {
      if (!node || depth > maxDepth) return null;
      var el = node.Element || node.m_element || node.m_Element;
      var children = node.m_rgChildren || node.Children || [];
      var info = {
        d: depth,
        tag: el ? el.tagName : null,
        cls: el ? (el.className || '').substring(0, 80) : null,
        id: el ? (el.id || '') : null,
        ti: el ? el.tabIndex : null,
        fc: node.m_strFlowChildren || null,
        cc: children.length,
        cm: el && mount ? el.contains(mount) : null
      };
      if (children.length > 0 && depth < maxDepth) {
        info.ch = [];
        for (var i = 0; i < Math.min(children.length, 30); i++) {
          var child = describeNode(children[i], depth + 1, maxDepth);
          if (child) info.ch.push(child);
        }
      }
      return info;
    }

    if (mainTree) {
      var root = mainTree.Root || mainTree.m_Root || mainTree;
      out.mainTree = describeNode(root, 0, 5);
    }

    // 4. Check mount DOM context
    if (mount) {
      out.mountRenderer = mount.dataset ? mount.dataset.deckShelvesRenderer : null;
      out.mountChildren = mount.childElementCount;

      // Check the Focusable wrapper from DeckRow
      var focusableWrappers = mount.querySelectorAll('[class*="ds-row-scroll"]');
      out.focusableWrapperCount = focusableWrappers.length;
      if (focusableWrappers.length > 0) {
        var fw = focusableWrappers[0];
        out.focusableWrapperTag = fw.tagName;
        out.focusableWrapperClass = (fw.className || '').substring(0, 120);
        out.focusableWrapperTabIndex = fw.tabIndex;
        // Check React fiber on the wrapper
        var fiberKey = Object.keys(fw).find(function(k) { return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0; });
        out.focusableWrapperHasFiber = !!fiberKey;
      }

      // Check mount-adjacent siblings in the DOM
      var parent = mount.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children);
        var mountIdx = siblings.indexOf(mount);
        out.mountSiblingInfo = {
          total: siblings.length,
          mountIdx: mountIdx,
          siblings: siblings.slice(Math.max(0, mountIdx - 2), mountIdx + 3).map(function(s) {
            return {
              tag: s.tagName,
              cls: (s.className || '').substring(0, 80),
              id: s.id || '',
              ti: s.tabIndex
            };
          })
        };
      }

      // Check the scroll container (ancestor with tabIndex 0)
      var scrollEl = mount.closest('._39tNvaLedsTrVh0fFsP4Jm');
      if (scrollEl) {
        // Check React fiber on the scroll container to find its Focusable context
        var scrollFiber = Object.keys(scrollEl).find(function(k) { return k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0; });
        out.scrollContainerHasFiber = !!scrollFiber;
        out.scrollContainerTag = scrollEl.tagName;
        out.scrollContainerClass = (scrollEl.className || '').substring(0, 120);
      }

      out.cardCount = mount.querySelectorAll('.ds-card').length;
    } else {
      out.mountExists = false;
    }

    // 5. Check DFL, routerHook
    var dfl = window.DFL || window.deckyFrontendLib;
    out.hasDFL = !!dfl;
    if (dfl) {
      out.dflKeys = Object.keys(dfl).slice(0, 40);
      out.hasRouterHook = !!dfl.routerHook;
      if (dfl.routerHook) {
        out.routerHookKeys = Object.keys(dfl.routerHook).slice(0, 30);
      }
    }

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: e.message, stack: (e.stack || '').substring(0, 400) });
  }
})()
"""


def run_mode(mode: str) -> int:
    expr = {
        "mount": MOUNT_EXPR,
        "rows": ROWS_EXPR,
        "smoke": SMOKE_EXPR,
        "focus": FOCUS_EXPR,
    }[mode]

    raw = eval_in_shared(expr)
    if isinstance(raw, str):
        print(raw)
        if mode == "smoke":
            try:
                parsed = json.loads(raw)
                return 0 if parsed.get("pass") else 2
            except Exception:
                return 2
        return 0

    print(json.dumps({"error": "unexpected-response", "raw": raw}, ensure_ascii=False))
    return 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["mount", "rows", "smoke", "focus"], required=True)
    args = parser.parse_args()

    try:
        return run_mode(args.mode)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
