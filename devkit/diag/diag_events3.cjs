#!/usr/bin/env node
// Find the d.u8 helper and the actual event name it uses
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

// Monkey-patch addEventListener on a shelf element to capture the event name
var expression = `(function() {
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var doc = bpWin.document;
  var rowEl = doc.querySelector('.ds-row-scroll');
  if (!rowEl) return JSON.stringify({ error: 'no row element' });

  // Collect all registered event types by monkey-patching
  var captured = [];
  var orig = rowEl.addEventListener;
  rowEl.addEventListener = function(type) {
    captured.push(type);
    return orig.apply(this, arguments);
  };

  // Also look at the cleanup function source more carefully
  // The handler cleanup fn is: () => function(e,t,n){e.removeEventListener(t,n)}(e,t,n)
  // where e=element, t=eventName, n=handler
  // The event name 't' is captured in closure
  
  // Actually, simpler: just look at what events are on a native section's element
  // Check a native section's nav events
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  
  // Get the handler cleanup fn and examine its closure
  function findByClass(node, cls) {
    var el = node.Element || node.m_element || node.m_Element;
    if (el && (el.className || '').indexOf(cls) >= 0) return node;
    for (var c of (node.m_rgChildren || [])) {
      var f = findByClass(c, cls);
      if (f) return f;
    }
    return null;
  }
  var shelfNode = findByClass(root, 'ds-row-scroll');
  
  // Try to get OnNavigationEvent - it's bound to the element.
  // The event it listens for is an internal Steam event.
  // Check prototype chain for the actual event dispatching.
  
  // Alternative approach: check what gamepad events Steam dispatches  
  // by looking at the gamepad dispatch code
  var vpDispatch = null;
  if (bpWin.SteamClient) {
    vpDispatch = 'has SteamClient';
  }
  
  // Best approach: install a temporary MutationObserver or event monitor
  // Actually let's just check the event name from the stored handler.
  // The handler stores: d.u8(element, callback) where d.u8 is:
  // function u8(element, handler) { element.addEventListener(EVENT_NAME, handler); return () => element.removeEventListener(EVENT_NAME, handler); }
  
  // Let me find u8 by examining navigation module exports
  var navModule = null;
  try {
    // The handler cleanup function closes over (e, t, n) where t is the event name
    // Let me try to extract it using Function.prototype.toString on the cleanup
    var handlers = shelfNode ? shelfNode.m_rgNavigationHandlers : [];
    if (handlers.length > 0) {
      // The cleanup is arrow fn closing over e=element, t=eventName, n=handler
      // We can't easily extract closures, so let's try another way:
      // monkey-patch removeEventListener
      var removedEvents = [];
      if (shelfNode && shelfNode.m_element) {
        var origRemove = shelfNode.m_element.removeEventListener;
        shelfNode.m_element.removeEventListener = function(type) {
          removedEvents.push(type);
          return origRemove.apply(this, arguments);
        };
        // Call the cleanup fn
        handlers[0]();
        shelfNode.m_element.removeEventListener = origRemove;
        // Now re-register
        shelfNode.m_rgNavigationHandlers = [];
        shelfNode.RegisterDOMEvents();
      }
      return JSON.stringify({ removedEvents: removedEvents, reregistered: true });
    }
  } catch(ex) {
    return JSON.stringify({ error: ex.message });
  }
  
  return JSON.stringify({ captured: captured, info: 'no handlers found' });
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
