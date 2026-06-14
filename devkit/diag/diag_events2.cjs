#!/usr/bin/env node
// Find the gamepad event registration helper and event names
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

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

// Instead of guessing, let's look at what RegisterDOMEvents returns (the cleanup fn)
// and what events are registered on our element
var expression = `(function() {
  var ctrl = window.FocusNavController;
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var doc = bpWin.document;
  var mount = doc.getElementById('deck-shelves-home-root');
  if (!mount) return JSON.stringify({ error: 'no mount' });

  // Find a ds-row-scroll nav node
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

  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  var shelfNode = findByClass(root, 'ds-row-scroll');
  if (!shelfNode) return JSON.stringify({ error: 'no shelf node' });

  // Check m_Properties for the Focusable component's nav properties
  var navProps = {};
  var props = shelfNode.m_Properties || {};
  Object.keys(props).forEach(function(k) {
    navProps[k] = typeof props[k] === 'function' ? '[fn]' : props[k];
  });

  // Check handler cleanup fn source - each handler entry stores a cleanup fn
  var handlers = shelfNode.m_rgNavigationHandlers || [];
  var hSources = handlers.map(function(h) {
    return h.toString().substring(0, 200);
  });

  // Check GetNodeEventHandlers on the element - Steam patches element event listeners
  var el = shelfNode.m_element;
  var elEvents = null;
  if (el && el.getEventListeners) {
    // Chrome devtools protocol has this 
    elEvents = 'has getEventListeners';
  }

  // Try to find event name by checking the handler content
  var regSrc = Object.getPrototypeOf(shelfNode).RegisterDOMEvents.toString();
  // Extract the function call pattern - look for event name strings
  var eventNames = [];
  var matches = regSrc.match(/["']([a-zA-Z_]+)["']/g);
  if (matches) eventNames = matches;

  return JSON.stringify({
    navProps: navProps,
    handlerSources: hSources,
    eventNames: eventNames,
    regDomEventsSrc: regSrc.substring(0, 800)
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
