#!/usr/bin/env node
// Probe: listen for all custom events on a card to find the gamepad direction event name
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

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

// Look at what event listeners the Focusable registers on its element  
var expression = `(function() {
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var doc = bpWin.document;
  
  // Find event handlers registered by looking at prototype of RegisterDOMEvents
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  
  // Get RegisterDOMEvents source
  var proto = Object.getPrototypeOf(root);
  var regSrc = proto.RegisterDOMEvents ? proto.RegisterDOMEvents.toString().substring(0, 500) : null;
  var onNavSrc = proto.OnNavigationEvent ? proto.OnNavigationEvent.toString().substring(0, 500) : null;
  
  return JSON.stringify({
    registerDOMEvents: regSrc,
    onNavigationEvent: onNavSrc
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
