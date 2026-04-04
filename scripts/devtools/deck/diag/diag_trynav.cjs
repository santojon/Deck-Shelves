#!/usr/bin/env node
// Check how navigation events flow - look at OnNavigationEvent implementation
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
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);
  
  // Get BTryInternalNavigation full source
  var tryNav = proto.BTryInternalNavigation ? proto.BTryInternalNavigation.toString() : null;
  
  // Get ComputeRelativeDirection source
  var compDir = proto.ComputeRelativeDirection ? proto.ComputeRelativeDirection.toString() : null;
  
  // Get FindNextFocusableChildInDirection source
  var findNext = proto.FindNextFocusableChildInDirection ? proto.FindNextFocusableChildInDirection.toString().substring(0, 500) : null;

  return JSON.stringify({
    BTryInternalNavigation: tryNav ? tryNav.substring(0, 1000) : null,
    ComputeRelativeDirection: compDir ? compDir.substring(0, 500) : null,
    FindNextFocusableChildInDirection: findNext
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
