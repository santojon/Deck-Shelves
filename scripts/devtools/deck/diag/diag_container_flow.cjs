#!/usr/bin/env node
// Check if the target container Panel has flow-children="column" set on it
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_container_flow.cjs <targetId>\n'); process.exit(1); }

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
  var mount = document.getElementById('deck-shelves-home-root');
  if (!mount) return JSON.stringify({ error: 'no mount' });

  // Walk up from mount to find the Panel Focusable container (direct parent)
  var parent = mount.parentElement;
  if (!parent) return JSON.stringify({ error: 'no parent' });

  var cs = window.getComputedStyle(parent);
  return JSON.stringify({
    parentCls: parent.className,
    parentTag: parent.tagName,
    flowChildren: parent.getAttribute('flow-children'),
    display: cs.display,
    flexDir: cs.flexDirection,
    childCount: parent.childElementCount,
    // Also check grandparent
    gpCls: parent.parentElement ? parent.parentElement.className : null,
    gpFlowChildren: parent.parentElement ? parent.parentElement.getAttribute('flow-children') : null
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
    } else { process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n'); }
    client.close();
    process.exit(0);
  });
});

client.on('error', function(e) { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
setTimeout(function() { process.stdout.write('TIMEOUT\n'); process.exit(1); }, 10000);
