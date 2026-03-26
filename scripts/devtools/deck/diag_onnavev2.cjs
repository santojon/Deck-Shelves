#!/usr/bin/env node
// Get OnNavigationEvent source from prototype (not bound instance)
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

var client = new ws('ws://192.168.1.15:8081/devtools/page/' + target);
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
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);

  var results = {};
  
  // Get OnNavigationEvent from the prototype descriptor
  var desc = Object.getOwnPropertyDescriptor(proto, 'OnNavigationEvent');
  if (desc && desc.value) {
    results.protoOnNavEvent = desc.value.toString().substring(0, 3000);
  } else {
    results.protoOnNavEventDesc = desc ? JSON.stringify({
      configurable: desc.configurable,
      enumerable: desc.enumerable,
      writable: desc.writable,
      hasGet: !!desc.get,
      hasSet: !!desc.set,
      hasValue: !!desc.value
    }) : 'not on proto';
    
    // Try walking the prototype chain
    var p = proto;
    while (p) {
      var d2 = Object.getOwnPropertyDescriptor(p, 'OnNavigationEvent');
      if (d2 && d2.value && typeof d2.value === 'function') {
        var src = d2.value.toString();
        if (src.indexOf('native code') < 0) {
          results.foundOnProto = src.substring(0, 3000);
          break;
        }
      }
      p = Object.getPrototypeOf(p);
    }
  }

  // Also get it via unbound access
  results.protoOnNavDirect = proto.OnNavigationEvent ? proto.OnNavigationEvent.toString().substring(0, 3000) : null;

  // Check if the instance overrides it via bound
  var wrapper = null;
  function findW(n) {
    if (wrapper) return;
    var el = n.Element || n.m_element;
    if (el && (el.className||'').indexOf('deck-shelves-root') >= 0) { wrapper = n; return; }
    for (var c of (n.m_rgChildren||[])) findW(c);
  }
  findW(root);
  
  if (wrapper) {
    var row = null;
    for (var c of (wrapper.m_rgChildren||[])) {
      var el = c.Element || c.m_element;
      if (el && (el.className||'').indexOf('ds-row-scroll') >= 0) { row = c; break; }
    }
    if (!row) {
      // deeper search
      function findR(n) {
        for (var c of (n.m_rgChildren||[])) {
          var el = c.Element || c.m_element;
          if (el && (el.className||'').indexOf('ds-row-scroll') >= 0) return c;
          var r = findR(c);
          if (r) return r;
        }
        return null;
      }
      row = findR(wrapper);
    }
    if (row) {
      // Check if OnNavigationEvent is an own property
      results.rowHasOwnOnNav = row.hasOwnProperty('OnNavigationEvent');
      
      // Try to get the unbound version via prototype
      var rowProto = Object.getPrototypeOf(row);
      var pDesc = Object.getOwnPropertyDescriptor(rowProto, 'OnNavigationEvent');
      if (pDesc && pDesc.value) {
        var s = pDesc.value.toString();
        if (s.indexOf('native code') < 0) {
          results.rowProtoOnNav = s.substring(0, 3000);
        } else {
          results.rowProtoOnNavNative = true;
        }
      }
      
      // Check m_Properties values for onMove* 
      var props = row.m_Properties;
      if (props) {
        results.onMoveLeft = props.onMoveLeft ? props.onMoveLeft.toString().substring(0, 200) : null;
        results.onMoveRight = props.onMoveRight ? props.onMoveRight.toString().substring(0, 200) : null;
        results.onMoveUp = props.onMoveUp ? props.onMoveUp.toString().substring(0, 200) : null;
        results.onMoveDown = props.onMoveDown ? props.onMoveDown.toString().substring(0, 200) : null;
      }
    }
  }

  return JSON.stringify(results);
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (val) {
      try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
      catch(e) { process.stdout.write(val + '\n'); }
    } else {
      process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n');
    }
    client.close();
    process.exit(0);
  });
});
