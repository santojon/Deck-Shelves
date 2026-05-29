#!/usr/bin/env node
// Probe the discount / NEW badge layout. Reports for each badge host:
//   - the host element (portal vs inline)
//   - the computed font-size + band size
//   - whether it sits above a `.gpfocus` ring (z-index check)
//   - position type (fixed vs absolute) + parent stacking context
//
// Usage:  node diag_badges_layout.cjs <target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_badges_layout.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var hosts = document.querySelectorAll(".ds-card-badge-host");',
  '  out.totalHosts = hosts.length;',
  '  out.hostsSample = Array.from(hosts).slice(0, 5).map(function (h, i) {',
  '    var cs = getComputedStyle(h);',
  '    var r = h.getBoundingClientRect();',
  '    var band = h.querySelector(".ds-new-badge-band");',
  '    var badge = h.querySelector(".ds-new-badge");',
  '    var badgeCS = badge && getComputedStyle(badge);',
  '    return {',
  '      i: i,',
  '      isPortal: h.classList.contains("ds-card-badge-host--portal"),',
  '      isInline: h.classList.contains("ds-card-badge-host--inline"),',
  '      position: cs.position,',
  '      zIndex: cs.zIndex,',
  '      rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },',
  '      bandHeight: band ? Math.round(band.getBoundingClientRect().height) : null,',
  '      badgeText: badge ? badge.textContent.trim().slice(0, 40) : null,',
  '      badgeFontSize: badgeCS ? badgeCS.fontSize : null,',
  '      badgeLineHeight: badgeCS ? badgeCS.lineHeight : null,',
  '      badgePadding: badgeCS ? badgeCS.padding : null,',
  '    };',
  '  });',
  '  // Sample preview card dimensions for size proportionality',
  '  var previewCard = document.querySelector("[data-ds-preview-row=\\"1\\"] .ds-card");',
  '  if (previewCard) {',
  '    var pr = previewCard.getBoundingClientRect();',
  '    out.previewCard = { width: Math.round(pr.width), height: Math.round(pr.height) };',
  '  }',
  '  // Home card sample',
  '  var homeCard = document.querySelector(".ds-shelf .ds-card");',
  '  if (homeCard) {',
  '    var hr = homeCard.getBoundingClientRect();',
  '    out.homeCard = { width: Math.round(hr.width), height: Math.round(hr.height) };',
  '  }',
  '  // Focus ring sample (any .gpfocus element)',
  '  var focused = document.querySelector(".gpfocus");',
  '  if (focused) {',
  '    var fCS = getComputedStyle(focused);',
  '    out.focusedSample = { tag: focused.tagName, cls: focused.className.slice(0, 60), zIndex: fCS.zIndex };',
  '  }',
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
