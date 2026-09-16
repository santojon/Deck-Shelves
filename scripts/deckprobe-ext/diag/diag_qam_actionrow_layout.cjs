#!/usr/bin/env node
// Deep probe of the QAM action row layout. Walks the DOM from the first
// `.deck-shelves-action-btn` upward, dumping the computed width / padding
// / flex props of every ancestor up to the QAM scope so we can spot the
// exact element that's collapsing to its content width instead of
// stretching to fill the Field/scope.
//
// Usage:  node diag_qam_actionrow_layout.cjs <quickaccess-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_qam_actionrow_layout.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var btn = document.querySelector(".deck-shelves-action-btn");',
  '  if (!btn) return JSON.stringify({ err: "no action btn" });',
  '  function inspect(el) {',
  '    if (!el) return null;',
  '    var r = el.getBoundingClientRect();',
  '    var cs = getComputedStyle(el);',
  '    return {',
  '      tag: el.tagName,',
  '      cls: el.className.slice(0, 120),',
  '      rect: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },',
  '      display: cs.display,',
  '      flex: cs.flex,',
  '      flexGrow: cs.flexGrow,',
  '      flexShrink: cs.flexShrink,',
  '      flexBasis: cs.flexBasis,',
  '      width: cs.width,',
  '      padding: cs.padding,',
  '      boxSizing: cs.boxSizing,',
  '      justifyContent: cs.justifyContent,',
  '      childCount: el.children.length,',
  '    };',
  '  }',
  '  var chain = [];',
  '  var cur = btn;',
  '  for (var i = 0; i < 14 && cur; i++) {',
  '    chain.push({ depth: i, ...inspect(cur) });',
  '    if (cur.classList && cur.classList.contains("deck-shelves-qam-scope")) break;',
  '    cur = cur.parentElement;',
  '  }',
  '  return JSON.stringify({ chain: chain });',
  '})()',
].join('\n');

client.on('open', function () {
  client.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression: expression, returnByValue: true }}));
  client.on('message', function (data) {
    var msg = JSON.parse(data);
    if (msg.id !== msgId) return;
    try {
      var payload = JSON.parse(msg.result.result.value);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } catch (e) {
      process.stderr.write('parse failed: ' + String(e) + '\n');
      process.exit(2);
    }
    client.close();
    process.exit(0);
  });
});

client.on('error', function (e) {
  process.stderr.write('CDP connection failed: ' + String(e) + '\n');
  process.exit(2);
});
