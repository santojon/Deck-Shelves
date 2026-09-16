#!/usr/bin/env node
// QAM spacing probe — captures bounding rects for the action row above
// the shelf list and for each shelf row so we can quantify gaps,
// alignment, and edge-touching.
//
// Usage:  node diag_qam_spacing.cjs <quickaccess-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_qam_spacing.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = { viewport: { w: innerWidth, h: innerHeight } };',
  '  function rect(el) {',
  '    if (!el) return null;',
  '    var r = el.getBoundingClientRect();',
  '    return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };',
  '  }',
  '  var qamScope = document.querySelector(".deck-shelves-qam-scope");',
  '  out.qamScope = rect(qamScope);',
  '  var actionRow = document.querySelector(".deck-shelves-shelf-list > div > div:first-child > div:first-child");',
  '  // Better: select the panel directly above the shelf rows. The list panel is',
  '  // the parent of the action buttons + the row list.',
  '  var listRoot = document.querySelector(".deck-shelves-shelf-list");',
  '  out.listRootRect = rect(listRoot);',
  '  if (listRoot) {',
  '    var actionBtns = listRoot.querySelectorAll(".deck-shelves-action-btn");',
  '    out.actionBtns = Array.from(actionBtns).slice(0, 5).map(function (b, i) {',
  '      return { i: i, rect: rect(b) };',
  '    });',
  '    var rows = listRoot.querySelectorAll("[data-ds-reorder-focused]");',
  '    out.rows = Array.from(rows).slice(0, 5).map(function (r, i) {',
  '      var label = r.querySelector(".deck-shelves-label-cont");',
  '      var actions = r.querySelector("[data-ds-shelf-actions]");',
  '      return {',
  '        i: i,',
  '        rowRect: rect(r),',
  '        labelRect: rect(label),',
  '        actionsRect: rect(actions),',
  '      };',
  '    });',
  '  }',
  '  // Also capture the outer container the QAM gives us so we can see if our',
  '  // shim is missing horizontal padding entirely.',
  '  var fieldFallbacks = listRoot ? listRoot.querySelectorAll("div[style*=\\"flex-direction: column\\"][style*=\\"border-bottom\\"]") : [];',
  '  out.fieldFallbackCount = fieldFallbacks.length;',
  '  if (fieldFallbacks[0]) out.firstFieldFallbackStyle = fieldFallbacks[0].getAttribute("style");',
  '  return JSON.stringify(out);',
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
