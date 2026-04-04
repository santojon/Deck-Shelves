#!/usr/bin/env node
// Check CSS flex-direction on deck-shelves-root wrapper
'use strict';

var http = require('http');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_csscheck.cjs <targetId>\n'); process.exit(1); }

var ws = require('ws');
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
var wsUrl = 'ws://' + HOST + ':8081/devtools/page/' + target;
var client = new ws(wsUrl);
var msgId = 1;

function send(method, params) {
  var id = msgId++;
  client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  return id;
}

var expression = `(function() {
  var wrappers = document.querySelectorAll('.deck-shelves-root');
  if (!wrappers.length) return JSON.stringify({ found: false });
  var w = wrappers[0];
  var cs = window.getComputedStyle(w);
  return JSON.stringify({
    found: true,
    className: w.className,
    flexDirection: cs.flexDirection,
    display: cs.display,
    width: cs.width,
    childCount: w.children.length,
    childClasses: Array.from(w.children).map(function(c) { return c.className; })
  });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true });
});

client.on('message', function(data) {
  var msg;
  try { msg = JSON.parse(data); } catch(e) { return; }
  if (msg.result && msg.result.result) {
    var val = msg.result.result.value;
    if (val !== undefined) {
      process.stdout.write(val + '\n');
      client.close();
      process.exit(0);
    }
  }
});

client.on('error', function(e) { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
setTimeout(function() { process.stdout.write('TIMEOUT\n'); process.exit(1); }, 8000);
