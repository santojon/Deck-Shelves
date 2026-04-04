#!/usr/bin/env node
// Dump all own properties of the nav tree container node (the one holding all sections + our shelves)
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_navprops.cjs <targetId>\n'); process.exit(1); }

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
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  if (!main) return JSON.stringify({ error: 'no main tree' });
  var root = main.Root || main.m_Root || main;

  // Find the node whose DOM element contains our mount
  var mount = document.getElementById('deck-shelves-home-root');
  if (!mount) return JSON.stringify({ error: 'no mount in this context' });

  function findDeepest(node) {
    var ch = node.m_rgChildren || [];
    for (var j = 0; j < ch.length; j++) {
      var childEl = ch[j].Element || ch[j].m_element || ch[j].m_Element;
      if (childEl && childEl.contains(mount)) {
        return findDeepest(ch[j]) || ch[j];
      }
    }
    var el = node.Element || node.m_element || node.m_Element;
    if (el && el.contains(mount)) return node;
    return null;
  }

  var containerNode = findDeepest(root);
  if (!containerNode) return JSON.stringify({ error: 'no container node' });

  // Dump ALL own properties (name + type + short value)
  var ownProps = {};
  var keys = Object.getOwnPropertyNames(containerNode);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    try {
      var val = containerNode[key];
      var t = typeof val;
      if (t === 'function') {
        ownProps[key] = '[function]';
      } else if (t === 'object' && val !== null) {
        if (Array.isArray(val)) {
          ownProps[key] = '[array:' + val.length + ']';
        } else {
          var cn = val.constructor ? val.constructor.name : 'Object';
          ownProps[key] = '[' + cn + ']';
        }
      } else {
        ownProps[key] = val;
      }
    } catch(e) {
      ownProps[key] = '[error:' + e.message + ']';
    }
  }

  // Also dump prototype property names
  var protoProps = [];
  var proto = Object.getPrototypeOf(containerNode);
  if (proto && proto !== Object.prototype) {
    var pkeys = Object.getOwnPropertyNames(proto);
    for (var p = 0; p < pkeys.length; p++) {
      var pk = pkeys[p];
      try {
        var pval = containerNode[pk];
        var pt = typeof pval;
        if (pt === 'function') {
          protoProps.push(pk + ':[fn]');
        } else if (pt === 'object' && pval !== null) {
          protoProps.push(pk + ':[obj]');
        } else {
          protoProps.push(pk + ':' + JSON.stringify(pval));
        }
      } catch(e) {
        protoProps.push(pk + ':[err]');
      }
    }
  }

  // Find our wrapper child inside container
  var wrapper = null;
  var ch2 = containerNode.m_rgChildren || [];
  for (var j = 0; j < ch2.length; j++) {
    var el2 = ch2[j].Element || ch2[j].m_element || ch2[j].m_Element;
    if (el2 && (el2.className || '').indexOf('deck-shelves-root') >= 0) {
      wrapper = ch2[j];
      break;
    }
  }

  var wrapperOwnProps = null;
  if (wrapper) {
    wrapperOwnProps = {};
    var wkeys = Object.getOwnPropertyNames(wrapper);
    for (var w = 0; w < wkeys.length; w++) {
      var wk = wkeys[w];
      try {
        var wval = wrapper[wk];
        var wt = typeof wval;
        if (wt === 'function') wrapperOwnProps[wk] = '[function]';
        else if (wt === 'object' && wval !== null) {
          if (Array.isArray(wval)) wrapperOwnProps[wk] = '[array:' + wval.length + ']';
          else wrapperOwnProps[wk] = '[' + (wval.constructor ? wval.constructor.name : 'obj') + ']';
        } else wrapperOwnProps[wk] = wval;
      } catch(e) { wrapperOwnProps[wk] = '[err]'; }
    }
  }

  return JSON.stringify({
    containerChildCount: (containerNode.m_rgChildren || []).length,
    containerOwnProps: ownProps,
    containerProtoProps: protoProps,
    wrapperOwnProps: wrapperOwnProps
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
