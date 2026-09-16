#!/usr/bin/env node
// Probe the live plugin settings to confirm online owned-filter toggle
// state and per-shelf overrides. Bypasses the plugin callable lookup by
// reading the in-memory cache the React UI subscribes to (window-scoped
// store object).
//
// Usage:  node diag_owned_settings.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_owned_settings.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

// Iterate every window property looking for our settings cache shape.
var expression = [
  '(function () {',
  '  var out = { foundIn: [] };',
  '  var keys = Object.keys(window);',
  '  for (var i = 0; i < keys.length; i++) {',
  '    var k = keys[i];',
  '    try {',
  '      var v = window[k];',
  '      if (v && typeof v === "object" && Array.isArray(v.shelves) && v.shelves.length > 0 && (v.shelves[0].source || v.onlineHideOwnedGames !== undefined)) {',
  '        out.foundIn.push(k);',
  '        if (out.foundIn.length === 1) {',
  '          out.flags = {',
  '            enabled: v.enabled,',
  '            onlineFeaturesEnabled: v.onlineFeaturesEnabled,',
  '            onlineWishlistEnabled: v.onlineWishlistEnabled,',
  '            onlineHideOwnedGames: v.onlineHideOwnedGames,',
  '            onlineHideOwnedNonSteam: v.onlineHideOwnedNonSteam,',
  '            onlineHideOwnedNonSteamCloud: v.onlineHideOwnedNonSteamCloud,',
  '          };',
  '          out.onlineShelves = v.shelves.filter(function (sh) { return sh.source && (sh.source.type === "wishlist" || sh.source.type === "store"); }).map(function (sh) {',
  '            return { id: sh.id, title: sh.title, type: sh.source.type, excludeOwned: !!sh.source.excludeOwned, excludeOwnedNonSteam: !!sh.source.excludeOwnedNonSteam, hideOwnedNonSteamCloud: sh.source.hideOwnedNonSteamCloud };',
  '          });',
  '        }',
  '      }',
  '    } catch (e) {}',
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
      process.stderr.write('parse failed: ' + String(e) + ' raw: ' + JSON.stringify(msg.result) + '\n');
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
