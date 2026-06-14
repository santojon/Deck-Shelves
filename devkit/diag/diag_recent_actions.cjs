#!/usr/bin/env node
/**
 * Diagnostic: Inspect Recent Games card nav tree nodes to discover
 * what button handlers (onOKButton, onSecondaryButton, onOptionsButton,
 * onMenuButton, etc.) they have in their m_Properties.
 *
 * Usage: node devkit/diag_recent_actions.cjs [targetId]
 */
"use strict";
const http = require("http");
const WebSocket = require("ws");

const HOST = process.env.DECK_HOST || "steamdeck";
const CDP_PORT = 8081;

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${CDP_PORT}/json`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function cdpEval(ws, expr) {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.id === id) {
          ws.off("message", handler);
          resolve(msg.result?.result?.value);
        }
      } catch {}
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression: expr, returnByValue: true },
    }));
    setTimeout(() => { ws.off("message", handler); reject(new Error("timeout")); }, 15000);
  });
}

async function main() {
  const targets = await getTargets();
  let targetId = process.argv[2];

  if (!targetId) {
    const shared = targets.find((t) => /SharedJSContext/i.test(t.title));
    if (!shared) { console.error("No SharedJSContext found"); process.exit(1); }
    targetId = shared.id;
  }

  const target = targets.find((t) => t.id === targetId);
  if (!target) { console.error("Target not found:", targetId); process.exit(1); }
  const wsUrl = target.webSocketDebuggerUrl.replace("127.0.0.1", HOST);

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });

  const EXPR = `
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var ctrl = win.FocusNavController || window.FocusNavController;
    if (!ctrl) return JSON.stringify({ error: "No FocusNavController" });

    var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
    var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];

    // Find the main tree
    var mainTree = null;
    for (var i = 0; i < trees.length; i++) {
      if (trees[i].m_ID === "GamepadUI_Full_Root") { mainTree = trees[i]; break; }
    }
    if (!mainTree) return JSON.stringify({ error: "No main tree" });

    // Find Recently Played / Recent Games section
    // Walk tree to find nodes with class containing "Recent" or appid elements
    var results = [];

    function findRecentCards(node, depth) {
      if (!node || depth > 15) return;
      var el = node.m_element || node.Element;
      var children = node.m_rgChildren || node.Children || [];
      var props = node.m_Properties || {};

      // Check if this looks like a game card in Recent Games
      var cls = el ? (el.className || "") : "";
      var isRecentSection = cls.indexOf("RecentlyPlayed") >= 0 ||
                             cls.indexOf("recent") >= 0 ||
                             cls.indexOf("_2X0jSENqHn-global-header") >= 0;

      // Look for nodes with appid-related data or that are game cards
      // Steam's cards often have specific classes and handlers
      var hasActivate = typeof props.onActivate === "function" ||
                        typeof props.onOKButton === "function";
      var hasSecondary = typeof props.onSecondaryButton === "function";
      var hasOptions = typeof props.onOptionsButton === "function";
      var hasMenu = typeof props.onMenuButton === "function";
      var hasCancel = typeof props.onCancelButton === "function";

      // Check for flow-children="horizontal" which indicates a row
      var flow = el ? el.getAttribute("flow-children") : null;

      if (hasActivate && (hasSecondary || hasOptions || hasMenu)) {
        // This is a card-like node with multiple button handlers
        var propKeys = Object.keys(props).filter(function(k) {
          return typeof props[k] === "function" || (k.indexOf("on") === 0 && k.indexOf("Action") > 0);
        });

        // Get action descriptions
        var descriptions = {};
        var descKeys = ["onOKActionDescription", "onCancelActionDescription", "onSecondaryActionDescription", "onOptionsActionDescription", "onMenuActionDescription"];
        for (var dk = 0; dk < descKeys.length; dk++) {
          if (props[descKeys[dk]] !== undefined && props[descKeys[dk]] !== null) {
            descriptions[descKeys[dk]] = String(props[descKeys[dk]]);
          }
        }

        results.push({
          depth: depth,
          cls: cls.substring(0, 120),
          id: el ? (el.id || "") : "",
          flow: flow,
          handlerKeys: propKeys,
          descriptions: descriptions,
          allPropKeys: Object.keys(props).slice(0, 50)
        });
      }

      for (var ci = 0; ci < children.length && results.length < 20; ci++) {
        findRecentCards(children[ci], depth + 1);
      }
    }

    // Walk from the root
    var root = mainTree.m_Root || mainTree.Root;
    findRecentCards(root, 0);

    // Also specifically look for the "Recentes" section by finding the
    // scroll area where Recent Games live
    var recentInfo = [];
    function findRecentSection(node, depth) {
      if (!node || depth > 12) return;
      var el = node.m_element || node.Element;
      var children = node.m_rgChildren || node.Children || [];
      var cls = el ? (el.className || "") : "";

      // The Recent Games area in the nav tree — look for horizontal flow with game-card children
      var flow = el ? el.getAttribute("flow-children") : null;
      if (flow === "horizontal" && children.length >= 3) {
        // Check if children have game-like handlers
        var firstChild = children[0];
        var fp = firstChild ? (firstChild.m_Properties || {}) : {};
        if (typeof fp.onActivate === "function" || typeof fp.onOKButton === "function") {
          var childProps = [];
          for (var ci2 = 0; ci2 < Math.min(children.length, 3); ci2++) {
            var cp = children[ci2].m_Properties || {};
            var cpEl = children[ci2].m_element || children[ci2].Element;
            var cpKeys = Object.keys(cp).filter(function(k) {
              return typeof cp[k] === "function";
            });

            // Get all prop keys including action descriptions
            var allKeys = Object.keys(cp);
            var descr = {};
            var dd = ["onOKActionDescription", "onCancelActionDescription", "onSecondaryActionDescription", "onOptionsActionDescription", "onMenuActionDescription"];
            for (var ddi = 0; ddi < dd.length; ddi++) {
              if (cp[dd[ddi]] !== undefined && cp[dd[ddi]] !== null) {
                descr[dd[ddi]] = String(cp[dd[ddi]]);
              }
            }

            childProps.push({
              cls: cpEl ? (cpEl.className || "").substring(0, 100) : "",
              funcKeys: cpKeys,
              descr: descr,
              allKeys: allKeys.slice(0, 30)
            });
          }
          recentInfo.push({
            depth: depth,
            cls: cls.substring(0, 120),
            childCount: children.length,
            childProps: childProps
          });
        }
      }

      for (var ri = 0; ri < children.length && recentInfo.length < 5; ri++) {
        findRecentSection(children[ri], depth + 1);
      }
    }

    findRecentSection(root, 0);

    return JSON.stringify({
      cardsWithMultipleHandlers: results,
      horizontalRowsWithGameCards: recentInfo,
      treeCount: trees.length
    }, null, 2);

  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack || "").substring(0, 500) });
  }
})()
`;

  const result = await cdpEval(ws, EXPR);
  try {
    console.log(JSON.stringify(JSON.parse(result), null, 2));
  } catch {
    console.log(result);
  }

  ws.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
