#!/usr/bin/env node
// Check nav handler structure and event names on shelf nodes
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

var client = new ws('ws://127.0.0.1:8081/devtools/page/' + target);
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

var expression = `(function() {
  var ctrl = window.FocusNavController;
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var doc = bpWin.document;
  var mount = doc.getElementById('deck-shelves-home-root');
  if (!mount) return JSON.stringify({ error: 'no mount' });

  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;

  // Find our wrapper
  function findByClass(node, cls) {
    var el = node.Element || node.m_element || node.m_Element;
    if (el && (el.className || '').indexOf(cls) >= 0) return node;
    var ch = node.m_rgChildren || [];
    for (var j = 0; j < ch.length; j++) {
      var f = findByClass(ch[j], cls);
      if (f) return f;
    }
    return null;
  }

  var wrapper = findByClass(root, 'deck-shelves-root');
  if (!wrapper) return JSON.stringify({ error: 'no wrapper found' });

  // Check wrapper props
  var wLayout = wrapper.GetLayout ? wrapper.GetLayout() : null;
  var wHandlers = (wrapper.m_rgNavigationHandlers || []).map(function(h) { return typeof h === 'function' ? h.toString().substring(0, 100) : String(h).substring(0, 100); });

  // Check first shelf child (ds-row-scroll)
  var firstShelf = null;
  var ch = wrapper.m_rgChildren || [];
  if (ch.length > 0) firstShelf = ch[0];

  var shelfInfo = null;
  if (firstShelf) {
    var sel = firstShelf.Element || firstShelf.m_element || firstShelf.m_Element;
    var shelfHandlers = (firstShelf.m_rgNavigationHandlers || []).map(function(h) { return typeof h === 'function' ? h.toString().substring(0, 150) : String(h).substring(0, 100); });
    var shelfLayout = firstShelf.GetLayout ? firstShelf.GetLayout() : null;
    
    // Check ds-row-scroll child (the actual horizontal Focusable)
    var rowNode = null;
    var sch = firstShelf.m_rgChildren || [];
    for (var s = 0; s < sch.length; s++) {
      var scEl = sch[s].Element || sch[s].m_element || sch[s].m_Element;
      if (scEl && (scEl.className || '').indexOf('ds-row-scroll') >= 0) {
        rowNode = sch[s];
        break;
      }
    }

    var rowInfo = null;
    if (rowNode) {
      var rl = rowNode.GetLayout ? rowNode.GetLayout() : null;
      var rh = (rowNode.m_rgNavigationHandlers || []).map(function(h) { return typeof h === 'function' ? h.toString().substring(0, 150) : String(h).substring(0, 100); });
      rowInfo = {
        layout: rl,
        handlers: rh,
        cc: (rowNode.m_rgChildren || []).length,
        cls: (scEl.className || '').substring(0, 60)
      };
    }

    shelfInfo = {
      cls: sel ? (sel.className || '').substring(0, 60) : 'no-el',
      layout: shelfLayout,
      handlers: shelfHandlers,
      cc: sch.length,
      rowNode: rowInfo
    };
  }

  // Also check BTryInternalNavigation source
  var tryNav = null;
  if (firstShelf && firstShelf.BTryInternalNavigation) {
    tryNav = firstShelf.BTryInternalNavigation.toString().substring(0, 300);
  }

  return JSON.stringify({
    wrapperLayout: wLayout,
    wrapperHandlers: wHandlers,
    wrapperCC: ch.length,
    firstShelf: shelfInfo,
    tryInternalNav: tryNav
  });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (val) {
      try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
      catch(e) { process.stdout.write(val + '\n'); }
    } else { process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n'); }
    client.close();
    process.exit(0);
  });
});

client.on('error', function(e) { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
setTimeout(function() { process.stdout.write('TIMEOUT\n'); process.exit(1); }, 10000);
