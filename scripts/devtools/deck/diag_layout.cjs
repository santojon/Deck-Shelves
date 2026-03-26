#!/usr/bin/env node
// Inspect m_Properties and GetLayout() of container and wrapper nodes
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_layout.cjs <targetId>\n'); process.exit(1); }

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
  if (!ctrl) return JSON.stringify({ error: 'no FocusNavController' });

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
  if (!main) return JSON.stringify({ error: 'no main tree' });
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

  // Dump m_Properties
  var containerProps = containerNode.m_Properties || {};
  var cpDump = {};
  var cpkeys = Object.keys(containerProps);
  for (var k = 0; k < cpkeys.length; k++) {
    var key = cpkeys[k];
    var v = containerProps[key];
    cpDump[key] = (typeof v === 'function') ? '[fn]' : v;
  }

  // Call GetLayout()
  var containerLayout = null;
  try { containerLayout = containerNode.GetLayout(); } catch(e) { containerLayout = 'err:' + e.message; }

  // Call GetRelativeDirection - to see what it uses
  var relDir = null;
  try {
    var rd = containerNode.GetRelativeDirection;
    relDir = rd ? rd.toString().substring(0,200) : 'undefined';
  } catch(e) { relDir = 'err:' + e.message; }

  // Now find wrapper
  var wrapper = null;
  var ch2 = containerNode.m_rgChildren || [];
  for (var j = 0; j < ch2.length; j++) {
    var el2 = ch2[j].Element || ch2[j].m_element || ch2[j].m_Element;
    if (el2 && (el2.className || '').indexOf('deck-shelves-root') >= 0) {
      wrapper = ch2[j]; break;
    }
  }

  var wrapperProps = null;
  var wrapperLayout = null;
  if (wrapper) {
    wrapperProps = {};
    var wp = wrapper.m_Properties || {};
    var wpkeys = Object.keys(wp);
    for (var w = 0; w < wpkeys.length; w++) {
      var wk = wpkeys[w];
      var wv = wp[wk];
      wrapperProps[wk] = (typeof wv === 'function') ? '[fn]' : wv;
    }
    try { wrapperLayout = wrapper.GetLayout(); } catch(e) { wrapperLayout = 'err:' + e.message; }
  }

  // Check also a native child's properties for comparison
  var nativeChild = null;
  for (var n = 0; n < ch2.length; n++) {
    var nel = ch2[n].Element || ch2[n].m_element || ch2[n].m_Element;
    if (nel && (nel.className || '').indexOf('deck-shelves') < 0) {
      var np = ch2[n].m_Properties || {};
      var npDump = {};
      Object.keys(np).forEach(function(nk) {
        npDump[nk] = (typeof np[nk] === 'function') ? '[fn]' : np[nk];
      });
      var nl = null;
      try { nl = ch2[n].GetLayout(); } catch(e) { nl = 'err'; }
      nativeChild = { idx: n, cls: (nel.className || '').substring(0,50), props: npDump, layout: nl };
      break;
    }
  }

  return JSON.stringify({
    containerProps: cpDump,
    containerLayout: containerLayout,
    wrapperProps: wrapperProps,
    wrapperLayout: wrapperLayout,
    nativeChildSample: nativeChild
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
