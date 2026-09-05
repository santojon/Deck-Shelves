#!/usr/bin/env node
// Investigate WHAT is actually painting over the preview badges when
// a card is focused. Captures:
//   - the focused card's bounding rect + computed z-index
//   - the badge's bounding rect + computed z-index
//   - elementsFromPoint at the badge's centre to see the paint order
//     (the topmost element is what the user sees)
//   - any `.ds-focus-ring` / `FocusRingRoot` sibling we didn't strip
//
// Usage:  node diag_focus_vs_badge.cjs <target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_focus_vs_badge.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var focused = document.querySelector(".ds-card.gpfocus");',
  '  if (!focused) {',
  '    return JSON.stringify({ err: "no focused card", anyFocused: !!document.querySelector(".gpfocus") });',
  '  }',
  '  var fr = focused.getBoundingClientRect();',
  '  var fcs = getComputedStyle(focused);',
  '  out.focusedCard = {',
  '    rect: { left: Math.round(fr.left), top: Math.round(fr.top), right: Math.round(fr.right), bottom: Math.round(fr.bottom) },',
  '    zIndex: fcs.zIndex,',
  '    transform: fcs.transform,',
  '    boxShadow: fcs.boxShadow.slice(0, 60),',
  '  };',
  '  // Locate the focused cards inline badge',
  '  var inlineBadge = focused.querySelector(".ds-card-badge-host--inline");',
  '  if (inlineBadge) {',
  '    var br = inlineBadge.getBoundingClientRect();',
  '    var bcs = getComputedStyle(inlineBadge);',
  '    out.inlineBadge = {',
  '      rect: { left: Math.round(br.left), top: Math.round(br.top), right: Math.round(br.right), bottom: Math.round(br.bottom) },',
  '      zIndex: bcs.zIndex,',
  '      position: bcs.position,',
  '    };',
  '    // Hit-test the centre of the badge to see what is painted on top.',
  '    var cx = (br.left + br.right) / 2;',
  '    var cy = (br.top + br.bottom) / 2;',
  '    var stack = document.elementsFromPoint(cx, cy);',
  '    out.stackAtBadgeCentre = stack.slice(0, 8).map(function (e) {',
  '      var ecs = getComputedStyle(e);',
  '      return { tag: e.tagName, cls: e.className.toString().slice(0, 80), zIndex: ecs.zIndex, position: ecs.position };',
  '    });',
  '  }',
  '  // Look for SteamFocusRingRoot / focusRing siblings at body level',
  '  var ringCandidates = document.querySelectorAll("[class*=\\"focusRing\\"], [class*=\\"FocusRing\\"], .gpfocusring, .focusring");',
  '  out.ringCandidates = Array.from(ringCandidates).slice(0, 5).map(function (r) {',
  '    var rcs = getComputedStyle(r);',
  '    var rrect = r.getBoundingClientRect();',
  '    return { tag: r.tagName, cls: r.className.toString().slice(0, 80), zIndex: rcs.zIndex, visible: rrect.width > 0 && rrect.height > 0, rect: { left: Math.round(rrect.left), top: Math.round(rrect.top) } };',
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
