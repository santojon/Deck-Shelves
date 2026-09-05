#!/usr/bin/env node
// Online owned-filter inspection. Mirrors the production
// getLocalLibraryAppIds + name-dedup logic from src/components/Shelf.tsx
// against the live collectionStore + SteamClient so we can verify:
//   - which non-Steam shortcuts are tagged as cloud-play (per UF_CLOUD_COLLECTION_LABELS)
//   - how many ids end up in the name-dedup set under each effective-flag pair
//   - which actual non-Steam local titles populate the name set
//
// Usage:  node diag_online_owned_filter.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_online_owned_filter.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(async function () {',
  '  var out = {};',
  '  var cs = window.collectionStore;',
  '  if (!cs) return JSON.stringify({ err: "no collectionStore" });',
  '  // Replicate getUnifideckCloudPlaySet from production',
  '  var UF_CLOUD = new Set(["microsoft"]);',
  '  function cloudPlaySet() {',
  '    var ids = new Set();',
  '    var cols = cs.m_mapCollectionsFromStorage || cs.collectionsFromStorage;',
  '    var list = Array.isArray(cols) ? cols : Array.from((cols && cols.values && cols.values()) || []);',
  '    list.forEach(function (c) {',
  '      var name = String((c && (c.displayName || c.m_strName)) || "");',
  '      if (!/^\\[Unifideck\\]/i.test(name)) return;',
  '      var label = name.replace(/^\\[Unifideck\\]\\s*/i, "").trim().toLowerCase();',
  '      if (!UF_CLOUD.has(label)) return;',
  '      var apps = (c && (c.allApps || c.m_rgApps)) || [];',
  '      for (var i = 0; i < apps.length; i++) {',
  '        var n = Number(apps[i] && apps[i].appid);',
  '        if (Number.isFinite(n)) ids.add(n);',
  '      }',
  '    });',
  '    return ids;',
  '  }',
  '  var cloudSet = cloudPlaySet();',
  '  out.cloudPlaySetSize = cloudSet.size;',
  '  function isNonSteam(a) { var id = Number(a && (a.appid || a.m_unAppID)); return id > 0x40000000 || (a && a.app_type === 1073741824); }',
  '  function getLib(includeNonSteam, includeCloudPlay) {',
  '    var set = new Set();',
  '    var allG = cs.allGamesCollection;',
  '    if (allG) {',
  '      var a1 = allG.allApps || allG.visibleApps || [];',
  '      for (var i = 0; i < a1.length; i++) {',
  '        var x = a1[i];',
  '        if (isNonSteam(x)) continue;',
  '        var id = Number(x && (x.appid || x.m_unAppID));',
  '        if (id > 0) set.add(id);',
  '      }',
  '    }',
  '    if (includeNonSteam) {',
  '      var myG = cs.myGamesCollection || cs.allAppsCollection;',
  '      if (myG) {',
  '        var a2 = myG.allApps || myG.visibleApps || [];',
  '        for (var j = 0; j < a2.length; j++) {',
  '          var y = a2[j];',
  '          if (!isNonSteam(y)) continue;',
  '          var id2 = Number(y && (y.appid || y.m_unAppID));',
  '          if (!includeCloudPlay && cloudSet.has(id2)) continue;',
  '          if (id2 > 0) set.add(id2);',
  '        }',
  '      }',
  '    }',
  '    return set;',
  '  }',
  '  var lib_steamOnly = getLib(false, false);',
  '  var lib_local = getLib(true, false);',
  '  var lib_full = getLib(true, true);',
  '  out.libSizes = { steamOnly: lib_steamOnly.size, plusLocal: lib_local.size, plusCloud: lib_full.size };',
  '  // Now simulate the name-set build the way Shelf.tsx does.',
  '  // Iterate the full app list (mirrors fetchAllAppOverviews fallback to appStore).',
  '  var apps = (window.appStore && window.appStore.allApps) || [];',
  '  out.appStoreAllAppsLen = apps.length;',
  '  function buildNames(set) {',
  '    var names = new Set();',
  '    for (var i = 0; i < apps.length; i++) {',
  '      var a = apps[i];',
  '      var id = Number(a && a.appid);',
  '      if (!set.has(id)) continue;',
  '      var n = a && (a.display_name || a.name);',
  '      if (typeof n === "string" && n) names.add(n.trim().toLowerCase());',
  '    }',
  '    return names;',
  '  }',
  '  var names_steamOnly = buildNames(lib_steamOnly);',
  '  var names_local = buildNames(lib_local);',
  '  var names_full = buildNames(lib_full);',
  '  out.nameSetSizes = { steamOnly: names_steamOnly.size, plusLocal: names_local.size, plusCloud: names_full.size };',
  '  // Sample names added by including non-Steam local (the diff between steamOnly and local).',
  '  var addedByLocal = [];',
  '  names_local.forEach(function (n) { if (!names_steamOnly.has(n) && addedByLocal.length < 10) addedByLocal.push(n); });',
  '  out.namesAddedByIncludingNonSteamLocal = addedByLocal;',
  '  return JSON.stringify(out);',
  '})()',
].join('\n');

client.on('open', function () {
  client.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression: expression, returnByValue: true, awaitPromise: true }}));
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
