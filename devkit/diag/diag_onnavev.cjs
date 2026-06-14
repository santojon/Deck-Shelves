#!/usr/bin/env node
// Get OnNavigationEvent source and understand event dispatch
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

  // Find wrapper + first row
  var wrapper = null;
  function findW(n) {
    if (wrapper) return;
    var el = n.Element || n.m_element;
    if (el && (el.className||'').indexOf('deck-shelves-root') >= 0) { wrapper = n; return; }
    for (var c of (n.m_rgChildren||[])) findW(c);
  }
  findW(root);
  if (!wrapper) return JSON.stringify({ error: 'no wrapper' });

  var firstRow = null;
  function findR(n) {
    if (firstRow) return;
    for (var c of (n.m_rgChildren||[])) {
      var el = c.Element || c.m_element;
      if (el && (el.className||'').indexOf('ds-row-scroll') >= 0) { firstRow = c; return; }
      findR(c);
    }
  }
  findR(wrapper);
  if (!firstRow) return JSON.stringify({ error: 'no row' });

  var results = {};

  // 1. OnNavigationEvent source from the row instance
  results.rowOnNavEvent = firstRow.OnNavigationEvent ? firstRow.OnNavigationEvent.toString().substring(0, 2000) : null;

  // 2. OnNavigationEvent from a card child
  var card0 = (firstRow.m_rgChildren||[])[0];
  if (card0) {
    results.cardOnNavEvent = card0.OnNavigationEvent ? card0.OnNavigationEvent.toString().substring(0, 2000) : null;
  }

  // 3. Check prototype for BHandleNavigation or similar
  var proto = Object.getPrototypeOf(root);
  var protoMethods = Object.getOwnPropertyNames(proto).filter(function(n) {
    return typeof proto[n] === 'function' && 
      (n.indexOf('Nav') >= 0 || n.indexOf('Direction') >= 0 || n.indexOf('Focus') >= 0 || n.indexOf('Handle') >= 0);
  }).sort();
  results.protoNavMethods = protoMethods;

  // 4. Check the navigation handlers array on the row
  var navHandlers = firstRow.m_rgNavigationHandlers || [];
  results.navHandlerCount = navHandlers.length;
  if (navHandlers.length > 0) {
    results.navHandler0 = navHandlers[0].toString().substring(0, 500);
  }

  // 5. Check RegisterDOMEvents on prototype
  if (proto.RegisterDOMEvents) {
    results.RegisterDOMEvents = proto.RegisterDOMEvents.toString().substring(0, 2000);
  }

  // 6. Check GetLayout and m_Properties on the row
  results.rowLayout = firstRow.GetLayout ? firstRow.GetLayout() : null;
  results.rowPropsKeys = firstRow.m_Properties ? Object.keys(firstRow.m_Properties) : null;

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
