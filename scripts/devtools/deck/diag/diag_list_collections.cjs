#!/usr/bin/env node
// Run the same logic src/steam/index.ts:listCollections uses against the
// current target's collectionStore, so we can confirm whether the data
// is reachable from this context (QAM vs SharedJSContext).
//
// Usage:  node diag_list_collections.cjs <target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_list_collections.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var cs = window.collectionStore || (window.opener && window.opener.collectionStore);',
  '  if (!cs) return JSON.stringify({ err: "no collectionStore", hasOpener: !!window.opener, windowKeys: Object.keys(window).filter(function (k) { return k.toLowerCase().includes("collection"); }) });',
  '  var m = cs.m_mapCollectionsFromStorage;',
  '  if (!m || typeof m.keys !== "function") return JSON.stringify({ err: "no m_mapCollectionsFromStorage" });',
  '  var items = [];',
  '  for (var key of m.keys()) {',
  '    try { var c = m.get(key); if (c) items.push({ id: c.m_strId || key, name: c.displayName || c.m_strName }); } catch (e) {}',
  '  }',
  '  return JSON.stringify({ collectionsCount: items.length, sample: items.slice(0, 8) });',
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
