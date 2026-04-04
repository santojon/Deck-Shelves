#!/usr/bin/env node
// Full BTryInternalNavigation source + test what happens to internal state after blocked calls
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: node diag_fullnav.cjs <target>\n'); process.exit(1); }

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
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  if (!main) return JSON.stringify({ error: 'no main tree' });
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);

  var results = {};
  
  // 1. Get full BTryInternalNavigation source (up to 3000 chars)
  results.BTryInternalNavigation = proto.BTryInternalNavigation.toString().substring(0, 3000);
  
  // 2. Get FindNextFocusableChildGeometric full source
  results.FindNextFocusableChildGeometric = proto.FindNextFocusableChildGeometric ? 
    proto.FindNextFocusableChildGeometric.toString().substring(0, 2000) : null;

  // 3. Check if prototype is patched
  results.protoPatched = !!proto['__ds_edge_patched__'];

  // 4. Get OnNavigationEvent source if available
  // Find a ds-row-scroll node to check its registered handlers
  var wrapperNode = null;
  function findW(node) {
    if (wrapperNode) return;
    var el = node.Element || node.m_element || node.m_Element;
    if (el && typeof el.className === 'string' && el.className.indexOf('deck-shelves-root') >= 0) {
      wrapperNode = node;
      return;
    }
    for (var c of (node.m_rgChildren || [])) findW(c);
  }
  findW(root);

  if (wrapperNode) {
    var firstRow = null;
    function findR(node) {
      if (firstRow) return;
      for (var c of (node.m_rgChildren || [])) {
        var el = c.Element || c.m_element || c.m_Element;
        if (el && typeof el.className === 'string' && el.className.indexOf('ds-row-scroll') >= 0) {
          firstRow = c;
          return;
        }
        findR(c);
      }
    }
    findR(wrapperNode);

    if (firstRow) {
      // Check internal state properties
      var stateProps = {};
      var propNames = Object.getOwnPropertyNames(firstRow).sort();
      for (var p of propNames) {
        var v = firstRow[p];
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || v === null || v === undefined) {
          stateProps[p] = v;
        } else if (typeof v === 'function') {
          stateProps[p] = '[function]';
        } else if (Array.isArray(v)) {
          stateProps[p] = '[Array:' + v.length + ']';
        } else if (v && typeof v === 'object') {
          stateProps[p] = '[Object]';
        }
      }
      results.firstRowOrigState = stateProps;

      // Check the event handlers on the element
      var el = firstRow.Element || firstRow.m_element || firstRow.m_Element;
      if (el) {
        results.hasEdgeListener = !!el['__ds_edge_listener__'];
        
        // Get list of registered event types via getEventListeners if available
        // Check how many vgp_ondirection listeners
        results.elClassName = el.className;
      }

      // Check m_fnRegisteredDOMEvents or similar cleanup function
      if (firstRow.m_fnRegisteredDOMEvents) {
        results.m_fnRegisteredDOMEvents = firstRow.m_fnRegisteredDOMEvents.toString().substring(0, 500);
      }
      
      // Walk up the event dispatch chain to understand the bubbling
      var parent = firstRow.m_Parent;
      var chain = [];
      while (parent && chain.length < 6) {
        var pEl = parent.Element || parent.m_element || parent.m_Element;
        chain.push({
          className: pEl ? (pEl.className || '').substring(0, 80) : '?',
          layout: typeof parent.GetLayout === 'function' ? parent.GetLayout() : '?',
          childCount: (parent.m_rgChildren || []).length
        });
        parent = parent.m_Parent;
      }
      results.parentChain = chain;
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
