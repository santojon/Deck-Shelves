#!/usr/bin/env python3
"""Inspect Recent Games vs Shelf card nav tree properties on Steam Deck."""
import json, socket, os, struct, base64, urllib.request

host = os.getenv('DECK_CDP_HOST', '127.0.0.1')

def ws_connect(path):
  s = socket.socket()
  s.settimeout(20)
  s.connect((host, 8081))
    key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET {path} HTTP/1.1\r\nHost: {host}:8081\r\n"
          f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
          f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.sendall(req.encode())
    r = b""
    while b"\r\n\r\n" not in r:
        r += s.recv(4096)
    return s

def ws_send(s, d):
    p = d.encode()
    f = bytearray([0x81])
    l = len(p)
    if l < 126:
        f.append(0x80 | l)
    elif l < 65536:
        f.append(0x80 | 126)
        f.extend(struct.pack(">H", l))
    else:
        f.append(0x80 | 127)
        f.extend(struct.pack(">Q", l))
    m = os.urandom(4)
    f.extend(m)
    for i, b in enumerate(p):
        f.append(b ^ m[i % 4])
    s.sendall(bytes(f))

def ws_recv(s):
    d = b""
    while True:
        d += s.recv(65536)
        if len(d) < 2:
            continue
        l = d[1] & 0x7F
        o = 2
        if l == 126:
            l = struct.unpack(">H", d[2:4])[0]
            o = 4
        elif l == 127:
            l = struct.unpack(">Q", d[2:10])[0]
            o = 10
        if len(d) >= o + l:
            return d[o:o + l].decode(errors="replace")

sources_url = f"http://{host}:8081/json"
targets = json.loads(urllib.request.urlopen(sources_url).read())
shared = [t for t in targets if "SharedJSContext" in t.get("title", "")][0]
ws_path = shared["webSocketDebuggerUrl"].split(f"{host}:8081", 1)[1]
s = ws_connect(ws_path)

EXPR = r"""(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var results = {};

    // Check ds-card fiber props at all depths
    var dsCards = doc.querySelectorAll(".ds-card");
    results.dsCardCount = dsCards.length;

    if (dsCards.length > 0) {
      var card = dsCards[0];
      var fk = Object.keys(card).find(function(k) { return k.startsWith("__reactFiber$"); });
      results.hasFiber = !!fk;

      if (fk) {
        var fiberChain = [];
        var f = card[fk];
        for (var d = 0; d < 12 && f; d++) {
          var p = f.memoizedProps || f.pendingProps || {};
          var pKeys = Object.keys(p);
          var funcKeys = pKeys.filter(function(k) { return typeof p[k] === "function"; });
          fiberChain.push({
            depth: d,
            type: f.type ? (f.type.displayName || f.type.name || (typeof f.type === "string" ? f.type : typeof f.type)) : null,
            allKeys: pKeys.slice(0, 30),
            funcKeys: funcKeys,
            hasOnActivate: typeof p.onActivate === "function",
            hasOnOKButton: typeof p.onOKButton === "function",
            hasOnMenuButton: typeof p.onMenuButton === "function",
            hasOnClick: typeof p.onClick === "function",
            className: typeof p.className === "string" ? p.className.substring(0, 80) : null
          });
          f = f.return;
        }
        results.fiberChain = fiberChain;
      }

      // Also check the nav tree node properties
      var ctrl = win.FocusNavController || window.FocusNavController;
      if (ctrl) {
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];
        var mainTree = null;
        for (var i = 0; i < trees.length; i++) {
          if (trees[i].m_ID === "GamepadUI_Full_Root") { mainTree = trees[i]; break; }
        }
        if (mainTree) {
          var root = mainTree.m_Root || mainTree.Root;
          var foundNavNode = null;

          function findDsCard(node) {
            if (foundNavNode) return;
            var el = node.m_element || node.Element;
            if (el && el.className && el.className.indexOf("ds-card") >= 0) {
              foundNavNode = node;
              return;
            }
            var children = node.m_rgChildren || [];
            for (var ci = 0; ci < children.length; ci++) {
              findDsCard(children[ci]);
            }
          }
          findDsCard(root);

          if (foundNavNode) {
            var navProps = foundNavNode.m_Properties || {};
            var navPropKeys = Object.keys(navProps);
            var navFuncKeys = navPropKeys.filter(function(k) { return typeof navProps[k] === "function"; });
            results.navTreeNode = {
              allKeys: navPropKeys.slice(0, 40),
              funcKeys: navFuncKeys,
              hasOnActivate: typeof navProps.onActivate === "function",
              hasOnOKButton: typeof navProps.onOKButton === "function",
              hasOnMenuButton: typeof navProps.onMenuButton === "function",
              hasActionDescriptionMap: !!navProps.actionDescriptionMap,
              cls: (foundNavNode.m_element || foundNavNode.Element || {}).className
            };

            // Also check if the node has OnActivate / OnOKButton in the event handler chain
            results.navTreeNode.hasOnNavigationFn = typeof foundNavNode.OnNavigationEvent === "function";
            results.navTreeNode.hasOnButtonEvent = typeof foundNavNode.OnButtonActionInternal === "function";

            // Check m_fnOnActivate
            results.navTreeNode.hasM_fnOnActivate = typeof foundNavNode.m_fnOnActivate === "function";
            results.navTreeNode.hasM_fnOnOKButton = typeof foundNavNode.m_fnOnOKButton === "function";
          } else {
            results.navTreeNode = "NOT_FOUND";
          }
        }
      }
    }

    return JSON.stringify(results, null, 2);
  } catch(e) {
    return JSON.stringify({error: e.message, stack: (e.stack || "").substring(0, 500)});
  }
})()"""

ws_send(s, json.dumps({"id": 1, "method": "Runtime.evaluate",
                        "params": {"expression": EXPR, "returnByValue": True}}))
raw = ws_recv(s)
msg = json.loads(raw)
val = msg.get("result", {}).get("result", {}).get("value", "")
try:
    print(json.dumps(json.loads(val), indent=2))
except Exception:
    print(val)
s.close()
