#!/usr/bin/env node
// Get OnNavigationEvent source from the class body (at offset 10276)
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
  var classSrc = proto.constructor.toString();

  // OnNavigationEvent occurrences at 5023 and 10276
  // Get the method body starting at 10276
  var idx = 10276;
  // Walk back to find the method signature start
  var methodStart = classSrc.lastIndexOf('}', idx) + 1;
  // Get 3000 chars from the method
  var snippet = classSrc.substring(idx - 50, idx + 3000);

  // Also find BTryInternalNavigation context
  var btryIdx = 10329;
  var btrySnippet = classSrc.substring(btryIdx - 50, btryIdx + 2000);

  return JSON.stringify({
    onNavSnippet: snippet,
    btrySnippet: btrySnippet,
    classLen: classSrc.length
  });
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
