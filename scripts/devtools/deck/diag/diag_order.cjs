#!/usr/bin/env node
// Show the ordered positions and element info of all nav tree children of the container
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_order.cjs <targetId>\n'); process.exit(1); }

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

  function findDeepest(node) {
    var ch = node.m_rgChildren || [];
    for (var j = 0; j < ch.length; j++) {
      var childEl = ch[j].Element || ch[j].m_element || ch[j].m_Element;
      if (childEl && childEl.contains && childEl.contains(mount)) {
        return findDeepest(ch[j]) || ch[j];
      }
    }
    var el = node.Element || node.m_element || node.m_Element;
    if (el && el.contains && el.contains(mount)) return node;
    return null;
  }

  var containerNode = findDeepest(root);
  if (!containerNode) return JSON.stringify({ error: 'no container' });

  var children = containerNode.m_rgChildren || [];
  var childInfo = [];
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    var el = child.Element || child.m_element || child.m_Element;
    var rect = null;
    if (el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      rect = { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
    }
    var cls = el ? (el.className || '').substring(0, 60) : 'no-el';
    var isMine = el && (cls.indexOf('deck-shelves') >= 0);
    var navKey = null;
    try { navKey = child.NavKey; } catch(e) {}
    var layout = null;
    try { layout = child.GetLayout(); } catch(e) {}
    var props = child.m_Properties || {};
    
    // Try to identify the section by its text content
    var label = '';
    if (el) {
      var firstText = el.querySelector('h2, h3, [class*="Label"], [class*="Title"]');
      if (firstText) label = (firstText.textContent || '').substring(0, 40);
    }
    
    childInfo.push({
      idx: i,
      isMine: isMine,
      cls: cls,
      navKey: navKey,
      layout: layout,
      rect: rect,
      label: label,
      cc: (child.m_rgChildren || []).length
    });
  }

  return JSON.stringify({
    containerLayout: containerNode.GetLayout(),
    childCount: children.length,
    children: childInfo
  });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (val) {
      try {
        var parsed = JSON.parse(val);
        process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
      } catch(e) { process.stdout.write(val + '\n'); }
    } else {
      process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n');
    }
    client.close();
    process.exit(0);
  });
});

client.on('error', function(e) { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
setTimeout(function() { process.stdout.write('TIMEOUT\n'); process.exit(1); }, 10000);
