#!/usr/bin/env node
// Show the nav tree ancestor chain from the container up to root
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_ancestors.cjs <targetId>\n'); process.exit(1); }

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

  // Find the deepest container first
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

  var deepestNode = findDeepest(root);
  if (!deepestNode) return JSON.stringify({ error: 'no container' });

  // Walk UP from deepest to root, recording each ancestor
  var ancestors = [];
  var node = deepestNode;
  while (node) {
    var el = node.Element || node.m_element || node.m_Element;
    var layout = null;
    try { layout = node.GetLayout(); } catch(e) {}
    var props = node.m_Properties || {};
    var rect = null;
    if (el && el.getBoundingClientRect) {
      var r = el.getBoundingClientRect();
      rect = { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
    }

    // What are this node's children (summary)?
    var ch = node.m_rgChildren || [];
    var childSummary = ch.length <= 5
      ? ch.map(function(c, i) {
          var cel = c.Element || c.m_element || c.m_Element;
          var cl = null;
          try { cl = c.GetLayout(); } catch(e) {}
          return {
            idx: i,
            cls: cel ? (cel.className || '').substring(0, 50) : 'no-el',
            layout: cl,
            cc: (c.m_rgChildren || []).length,
            mine: cel && (cel.className || '').indexOf('deck-shelves') >= 0
          };
        })
      : '(' + ch.length + ' children)';

    ancestors.push({
      depth: ancestors.length,
      cls: el ? (el.className || '').substring(0, 60) : 'no-el',
      layout: layout,
      cc: ch.length,
      rect: rect,
      navKey: props.navKey || null,
      focusable: props.focusable,
      children: childSummary
    });

    node = node.m_Parent;
    if (ancestors.length > 15) break;
  }

  return JSON.stringify({ ancestors: ancestors });
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
