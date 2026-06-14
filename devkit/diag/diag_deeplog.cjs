#!/usr/bin/env node
// Install deep instrumentation: log every BTryInternalNavigation call on relevant nodes
// and every vgp_ondirection event, then collect after 12s
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: node diag_deeplog.cjs <target>\n'); process.exit(1); }

var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
var client = new ws('ws://' + HOST + ':8081/devtools/page/' + target);
var msgId = 1;

function send(method, params, cb) {
  var id = msgId++;
  var handler = function(data) {
    var msg = JSON.parse(data);
    if (msg.id === id) {
      client.removeListener('message', handler);
      cb(null, msg.result);
    }
  };
  client.on('message', handler);
  client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
}

var installExpr = `(function() {
  window.__ds_deep_log = [];
  var L = window.__ds_deep_log;
  var DIR = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };

  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  if (!main) return JSON.stringify({ error: 'no main tree' });
  var root = main.Root || main.m_Root || main;

  // Find wrapper + rows
  var wrapperNode = null;
  function findW(n) {
    if (wrapperNode) return;
    var el = n.Element || n.m_element;
    if (el && (el.className||'').indexOf('deck-shelves-root') >= 0) { wrapperNode = n; return; }
    for (var c of (n.m_rgChildren||[])) findW(c);
  }
  findW(root);
  if (!wrapperNode) return JSON.stringify({ error: 'no wrapper' });

  var rows = [];
  function findR(n) {
    for (var c of (n.m_rgChildren||[])) {
      var el = c.Element || c.m_element;
      if (el && (el.className||'').indexOf('ds-row-scroll') >= 0) rows.push(c);
      else findR(c);
    }
  }
  findR(wrapperNode);

  // Instrument OnNavigationEvent on each row and its parent chain
  function instrumentNode(node, label) {
    if (node.__ds_instrumented) return;
    node.__ds_instrumented = true;
    
    // Wrap OnNavigationEvent
    if (node.OnNavigationEvent) {
      var origOnNav = node.OnNavigationEvent.bind(node);
      node.OnNavigationEvent = function(evt) {
        var btn = evt && evt.detail ? evt.detail.button : '?';
        var el = node.Element || node.m_element;
        var cn = el ? (el.className||'').substring(0, 40) : '?';
        L.push('[OnNavEvent] ' + label + ' (' + cn + ') dir=' + (DIR[btn]||btn));
        return origOnNav(evt);
      };
    }
  }

  for (var ri = 0; ri < rows.length; ri++) {
    instrumentNode(rows[ri], 'row' + ri);
    // Instrument each card child of the row
    var kids = rows[ri].m_rgChildren || [];
    for (var ki = 0; ki < kids.length; ki++) {
      instrumentNode(kids[ki], 'row' + ri + '/card' + ki);
    }
  }
  instrumentNode(wrapperNode, 'wrapper');
  
  // Instrument parent chain up 3 levels
  var p = wrapperNode.m_Parent;
  var pi = 0;
  while (p && pi < 3) {
    instrumentNode(p, 'parent' + pi);
    p = p.m_Parent;
    pi++;
  }

  // Also add a capture listener on the Big Picture document for vgp_ondirection
  var bpWin = null;
  try { bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow; } catch(e) {}
  if (bpWin) {
    var bpDoc = bpWin.document;
    bpDoc.addEventListener('vgp_ondirection', function(evt) {
      var btn = evt.detail ? evt.detail.button : '?';
      var tgt = evt.target;
      var cn = tgt ? (tgt.className||'').substring(0, 50) : '?';
      L.push('[vgp_ondirection] btn=' + (DIR[btn]||btn) + ' target=' + cn + ' phase=' + evt.eventPhase);
    }, true); // capture phase on document
  }

  // Instrument the scroll-area parent (layout:1, cc:3)
  var scrollParent = wrapperNode.m_Parent;
  if (scrollParent) {
    instrumentNode(scrollParent, 'scrollArea');
  }

  return JSON.stringify({ installed: true, rows: rows.length, bpWin: !!bpWin });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: installExpr, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    process.stdout.write('=== INSTRUMENTATION ===\\n');
    try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\\n'); }
    catch(e) { process.stdout.write((val||'null') + '\\n'); }

    process.stdout.write('\\nWaiting 15s - please reproduce: go to first card of first shelf, press LEFT, then navigate to last card, press RIGHT\\n\\n');

    setTimeout(function() {
      send('Runtime.evaluate', { expression: 'JSON.stringify(window.__ds_deep_log || [])', returnByValue: true }, function(err2, res2) {
        var val2 = res2 && res2.result && res2.result.value;
        process.stdout.write('=== LOG ===\\n');
        try {
          var arr = JSON.parse(val2);
          for (var e of arr) process.stdout.write(e + '\\n');
          process.stdout.write('\\n(' + arr.length + ' entries)\\n');
        } catch(e) { process.stdout.write((val2||'null') + '\\n'); }
        client.close();
        process.exit(0);
      });
    }, 15000);
  });
});
