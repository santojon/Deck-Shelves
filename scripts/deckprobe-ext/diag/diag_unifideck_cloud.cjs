#!/usr/bin/env node
// Probe the user's Steam collections for Unifideck cloud-play tags. The
// cloud-play exclusion in getLocalLibraryAppIds depends on collections
// named "[Unifideck] microsoft" (UF_CLOUD_COLLECTION_LABELS). When that
// set is empty, the cloud-play distinction is a noop and every non-Steam
// shortcut counts as locally-owned.
//
// Usage:  node diag_unifideck_cloud.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_unifideck_cloud.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var cs = window.collectionStore;',
  '  if (!cs) return JSON.stringify({ err: "no collectionStore" });',
  '  var cols = cs.m_mapCollectionsFromStorage || cs.collectionsFromStorage;',
  '  var list = Array.isArray(cols) ? cols : Array.from((cols && cols.values && cols.values()) || []);',
  '  out.totalCollections = list.length;',
  '  var unifideckCols = [];',
  '  list.forEach(function (c) {',
  '    var name = String((c && (c.displayName || c.m_strName)) || "");',
  '    if (/^\\[Unifideck\\]/i.test(name)) {',
  '      var apps = (c && (c.allApps || c.m_rgApps)) || [];',
  '      unifideckCols.push({ name: name, appCount: apps.length, firstAppId: apps[0] && Number(apps[0].appid) });',
  '    }',
  '  });',
  '  out.unifideckCollections = unifideckCols;',
  '  // Sample any collection name that mentions cloud/xbox/microsoft',
  '  var cloudCandidates = [];',
  '  list.forEach(function (c) {',
  '    var n = String((c && (c.displayName || c.m_strName)) || "");',
  '    if (/cloud|xbox|microsoft|epic|gog/i.test(n)) cloudCandidates.push(n);',
  '  });',
  '  out.cloudKeywordCollections = cloudCandidates.slice(0, 15);',
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
