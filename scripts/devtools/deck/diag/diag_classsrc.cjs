#!/usr/bin/env node
// Find OnNavigationEvent source in webpack bundle
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
  // The OnNavigationEvent AUTO-BIND getter captures the original fn as n.value.
  // We can recover it by creating a fresh instance that hasn't cached the bound version yet.
  // Or we can search the string representation of class L.
  
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);
  
  // The constructor source starts with "class L{...". 
  // The full class source includes all methods.
  // Let's get the FULL class source (up to 50KB)
  var classSrc = proto.constructor.toString();
  
  // Find OnNavigationEvent in the class source
  var idx = classSrc.indexOf('OnNavigationEvent');
  if (idx < 0) return JSON.stringify({ error: 'OnNavigationEvent not found in class', classLen: classSrc.length });

  // Extract ~2000 chars around it
  var start = Math.max(0, idx - 100);
  var end = Math.min(classSrc.length, idx + 3000);
  var snippet = classSrc.substring(start, end);

  // Also find all occurrences of OnNavigationEvent
  var occurrences = [];
  var searchIdx = 0;
  while (searchIdx < classSrc.length) {
    var found = classSrc.indexOf('OnNavigationEvent', searchIdx);
    if (found < 0) break;
    occurrences.push(found);
    searchIdx = found + 1;
  }

  // Also check for onMoveLeft in the class
  var onMoveIdx = classSrc.indexOf('onMoveLeft');
  var onMoveSrc = null;
  if (onMoveIdx >= 0) {
    onMoveSrc = classSrc.substring(Math.max(0, onMoveIdx - 200), Math.min(classSrc.length, onMoveIdx + 2000));
  }
  
  // Check for stopPropagation near BTryInternalNavigation
  var stopPropIdx = classSrc.indexOf('stopPropagation');
  var btryIdx = classSrc.indexOf('BTryInternalNavigation');
  
  return JSON.stringify({
    classLen: classSrc.length,
    onNavOccurrences: occurrences,
    snippet: snippet,
    onMoveSrc: onMoveSrc,
    stopPropIdx: stopPropIdx,
    btryIdx: btryIdx
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
