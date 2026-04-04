#!/usr/bin/env node
// Dump nav tree node properties - uses SteamUIStore to get the right document from SharedJS context
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_navprops2.cjs <targetId>\n'); process.exit(1); }

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
  if (!ctrl) return JSON.stringify({ error: 'no FocusNavController' });

  // Get the Big Picture window's document
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

  // Find the deepest node whose DOM element contains our mount
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
  if (!containerNode) return JSON.stringify({ error: 'no container node' });

  // Dump own properties
  var ownProps = {};
  var keys = Object.getOwnPropertyNames(containerNode);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    try {
      var val = containerNode[key];
      var t = typeof val;
      if (t === 'function') ownProps[key] = '[fn]';
      else if (t === 'object' && val !== null) {
        if (Array.isArray(val)) ownProps[key] = '[arr:' + val.length + ']';
        else ownProps[key] = '[' + (val.constructor ? val.constructor.name : 'obj') + ']';
      } else ownProps[key] = val;
    } catch(e) { ownProps[key] = '[err:' + e.message.substring(0,30) + ']'; }
  }

  // Prototype properties with values
  var protoEntries = {};
  var proto = Object.getPrototypeOf(containerNode);
  if (proto && proto !== Object.prototype) {
    var pkeys = Object.getOwnPropertyNames(proto);
    for (var p = 0; p < pkeys.length; p++) {
      var pk = pkeys[p];
      if (pk === 'constructor') continue;
      try {
        var desc = Object.getOwnPropertyDescriptor(proto, pk);
        if (desc && desc.get) {
          var gval = containerNode[pk];
          var gt = typeof gval;
          if (gt === 'function') protoEntries[pk] = '[fn/getter]';
          else if (gt === 'object' && gval !== null) {
            if (Array.isArray(gval)) protoEntries[pk] = '[arr:' + gval.length + '/getter]';
            else protoEntries[pk] = '[' + (gval.constructor ? gval.constructor.name : 'obj') + '/getter]';
          } else protoEntries[pk] = { value: gval, type: 'getter' };
        } else {
          var pval = containerNode[pk];
          var pt = typeof pval;
          if (pt === 'function') protoEntries[pk] = '[fn]';
          else protoEntries[pk] = pval;
        }
      } catch(e) { protoEntries[pk] = '[err:' + e.message.substring(0,30) + ']'; }
    }
  }

  // Check our wrapper node too
  var wrapperProps = null;
  var ch2 = containerNode.m_rgChildren || [];
  for (var j = 0; j < ch2.length; j++) {
    var el2 = ch2[j].Element || ch2[j].m_element || ch2[j].m_Element;
    if (el2 && (el2.className || '').indexOf('deck-shelves-root') >= 0) {
      wrapperProps = {};
      var wkeys = Object.getOwnPropertyNames(ch2[j]);
      for (var w = 0; w < wkeys.length; w++) {
        var wk = wkeys[w];
        try {
          var wval = ch2[j][wk];
          var wt = typeof wval;
          if (wt === 'function') wrapperProps[wk] = '[fn]';
          else if (wt === 'object' && wval !== null) {
            if (Array.isArray(wval)) wrapperProps[wk] = '[arr:' + wval.length + ']';
            else wrapperProps[wk] = '[' + (wval.constructor ? wval.constructor.name : 'obj') + ']';
          } else wrapperProps[wk] = wval;
        } catch(e) { wrapperProps[wk] = '[err]'; }
      }
      break;
    }
  }

  return JSON.stringify({
    containerCC: ch2.length,
    containerOwnProps: ownProps,
    containerProtoProps: protoEntries,
    wrapperOwnProps: wrapperProps
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
