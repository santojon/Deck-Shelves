#!/usr/bin/env node
// Read the plugin's in-memory shelf list directly from the shared
// settings global the store maintains, then highlight shelves whose
// sort fields carry signal (array form or sortReverse set).
//
// Usage:  node diag_sort_persistence.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_sort_persistence.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(async function () {',
  '  var out = {};',
  '  // Settings live in __DECK_SHELVES_SHARED_SETTINGS__ when the plugin is loaded;',
  '  // fall back to the localStorage cache when the global has not populated.',
  '  var s = window.__DECK_SHELVES_SHARED_SETTINGS__;',
  '  if (!s) {',
  '    try { var raw = window.localStorage && window.localStorage.getItem("deck-shelves-settings-cache-v3"); if (raw) s = JSON.parse(raw); } catch (e) {}',
  '  }',
  '  out.source = window.__DECK_SHELVES_SHARED_SETTINGS__ ? "global" : (s ? "localStorageCache" : null);',
  '  if (!s) return JSON.stringify({ err: "no settings source available" });',
  '  out.totalShelves = (s.shelves || []).length;',
  '  out.shelvesWithSortSignal = (s.shelves || []).map(function (sh) {',
  '    var fSort = sh.source && sh.source.filter && sh.source.filter.sort;',
  '    var fRev = sh.source && sh.source.filter && sh.source.filter.sortReverse;',
  '    var hasSignal = !!sh.sort || !!sh.sortReverse || (fSort && fSort !== "alphabetical") || !!fRev || Array.isArray(sh.sort) || Array.isArray(fSort);',
  '    return hasSignal ? { id: sh.id, title: (sh.title || "").slice(0, 40), sourceType: sh.source && sh.source.type, shelfSort: sh.sort, shelfSortReverse: sh.sortReverse, filterSort: fSort, filterSortReverse: fRev } : null;',
  '  }).filter(Boolean);',
  '  // For composite shelves, also surface the children types so we can spot multi-source breakage.',
  '  out.compositeShelves = (s.shelves || []).filter(function (sh) { return sh.source && sh.source.type === "composite"; }).map(function (sh) {',
  '    return { id: sh.id, title: (sh.title || "").slice(0, 40), combine: sh.source.combine, sort: sh.sort, sortReverse: sh.sortReverse, sources: (sh.source.sources || []).map(function (c) { return { type: c.type, value: c.collectionId || c.tab || (c.type === "wishlist" ? "(wishlist)" : c.type === "store" ? "(store)" : "(none)") }; }) };',
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
