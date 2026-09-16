#!/usr/bin/env node
// Probe preview badge geometry vs the row clipping. Reports:
//   - badge rect relative to the row container and preview wrapper
//   - any ancestor with overflow!=visible that could clip the top
//   - z-index stack at the badge centre (post-z:60 bump)
//
// Usage:  node diag_preview_badge_clip.cjs <target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_preview_badge_clip.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var badge = document.querySelector("[data-ds-preview-row=\\"1\\"] .ds-card-badge-host--inline");',
  '  if (!badge) return JSON.stringify({ err: "no inline badge in preview" });',
  '  function rect(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; }',
  '  var card = badge.closest(".ds-card");',
  '  var row = badge.closest("[data-ds-preview-row=\\"1\\"]");',
  '  out.badgeRect = rect(badge);',
  '  out.cardRect = rect(card);',
  '  out.rowRect = rect(row);',
  '  var bcs = getComputedStyle(badge);',
  '  out.badgeStyle = { position: bcs.position, top: bcs.top, height: bcs.height, zIndex: bcs.zIndex };',
  '  // Walk ancestors looking for clipping',
  '  var clippers = [];',
  '  var cur = badge.parentElement;',
  '  for (var i = 0; i < 10 && cur; i++) {',
  '    var cs = getComputedStyle(cur);',
  '    if (cs.overflow !== "visible" || cs.overflowY !== "visible" || cs.overflowX !== "visible") {',
  '      clippers.push({ tag: cur.tagName, cls: cur.className.slice(0, 80), overflow: cs.overflow, overflowY: cs.overflowY, overflowX: cs.overflowX, rect: rect(cur) });',
  '    }',
  '    cur = cur.parentElement;',
  '  }',
  '  out.clippingAncestors = clippers;',
  '  // Stack hit-test at badge centre',
  '  var br = badge.getBoundingClientRect();',
  '  var cx = (br.left + br.right) / 2;',
  '  var cy = (br.top + br.bottom) / 2;',
  '  var stack = document.elementsFromPoint(cx, cy);',
  '  out.stackAtBadgeCentre = stack.slice(0, 6).map(function (e) {',
  '    var es = getComputedStyle(e);',
  '    return { tag: e.tagName, cls: e.className.toString().slice(0, 80), zIndex: es.zIndex };',
  '  });',
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
