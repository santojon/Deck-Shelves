#!/usr/bin/env node
// Snapshot the persisted plugin state for diagnosing regressions:
//   - collection source returning empty (listCollections shape)
//   - multi-key sort + reverse not applying (persisted shelf sort fields)
//
// Usage:  node diag_collections_and_sort.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_collections_and_sort.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var s = window.__DECK_SHELVES_SHARED_SETTINGS__;',
  '  if (!s) return JSON.stringify({ err: "no settings global" });',
  '  out.shelvesByType = {};',
  '  (s.shelves || []).forEach(function (sh) {',
  '    var t = sh.source && sh.source.type;',
  '    if (!out.shelvesByType[t]) out.shelvesByType[t] = 0;',
  '    out.shelvesByType[t]++;',
  '  });',
  '  out.collectionShelves = (s.shelves || []).filter(function (sh) { return sh.source && sh.source.type === "collection"; }).map(function (sh) {',
  '    return { id: sh.id, title: sh.title.slice(0, 40), collectionId: sh.source.collectionId, sort: sh.sort, sortReverse: sh.sortReverse };',
  '  });',
  '  out.compositeShelves = (s.shelves || []).filter(function (sh) { return sh.source && sh.source.type === "composite"; }).map(function (sh) {',
  '    return { id: sh.id, title: sh.title.slice(0, 40), combine: sh.source.combine, sources: (sh.source.sources || []).map(function (c) { return { type: c.type, value: c.collectionId || c.tab || "(none)" }; }), sort: sh.sort, sortReverse: sh.sortReverse };',
  '  });',
  '  // Any shelf with a non-trivial sort spec (array or sortReverse set)',
  '  out.multiKeySortShelves = (s.shelves || []).filter(function (sh) { return Array.isArray(sh.sort) || (sh.sortReverse !== undefined && sh.sortReverse !== false); }).map(function (sh) {',
  '    return { id: sh.id, title: sh.title.slice(0, 40), sort: sh.sort, sortReverse: sh.sortReverse, sourceType: sh.source && sh.source.type };',
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
