#!/usr/bin/env node
// Trace the owned-filter chain for a specific wishlist item (defaults to
// Kingdom Come: Deliverance) to find where the name match falls through.
// Reports:
//   - whether the user has the title locally (Steam allGamesCollection or
//     non-Steam myGamesCollection)
//   - the exact name strings present in collectionStore for that title
//   - whether the iteration source (window.appStore.allApps) surfaces
//     those entries, since the name set is only populated from apps the
//     iteration sees
//   - whether the normalised ("trim().toLowerCase()") name ends up in the
//     ownedNames set the React effect builds
//
// Usage:  node diag_kcd_match.cjs <sharedjscontext-target-id> [query]
'use strict';

var ws = require('ws');
var target = process.argv[2];
var QUERY = (process.argv[3] || 'kingdom come').toLowerCase();
if (!target) {
  process.stderr.write('Usage: diag_kcd_match.cjs <target-id> [query]\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var QUERY = ' + JSON.stringify(QUERY) + ';',
  '  var out = { query: QUERY };',
  '  var cs = window.collectionStore;',
  '  if (!cs) return JSON.stringify({ err: "no collectionStore" });',
  '  function appsOf(c) { return (c && (c.allApps || c.visibleApps || c.apps)) || []; }',
  '  function search(label, arr) {',
  '    var matches = [];',
  '    for (var i = 0; i < arr.length; i++) {',
  '      var a = arr[i];',
  '      var n = String((a && (a.display_name || a.name || a.strDisplayName)) || "");',
  '      if (n.toLowerCase().indexOf(QUERY) !== -1) {',
  '        matches.push({',
  '          id: Number(a && (a.appid || a.m_unAppID)),',
  '          name: n,',
  '          normalized: n.trim().toLowerCase(),',
  '          isNonSteam: Number(a && (a.appid || a.m_unAppID)) > 0x40000000 || (a && a.app_type === 1073741824),',
  '          installed: !!(a && (a.installed || a.is_installed || a.m_bInstalled)),',
  '          source: label,',
  '        });',
  '      }',
  '    }',
  '    return matches;',
  '  }',
  '  out.allGames = search("allGamesCollection", appsOf(cs.allGamesCollection));',
  '  out.myGames = search("myGamesCollection", appsOf(cs.myGamesCollection));',
  '  out.allApps = search("allAppsCollection", appsOf(cs.allAppsCollection));',
  '  out.appStoreAllApps = search("appStore.allApps", (window.appStore && window.appStore.allApps) || []);',
  '  // Cross-check: is the normalised name in our computed name set?',
  '  var UF_CLOUD = new Set(["microsoft"]);',
  '  var cloudSet = new Set();',
  '  var cols = cs.m_mapCollectionsFromStorage || cs.collectionsFromStorage;',
  '  var list = Array.isArray(cols) ? cols : Array.from((cols && cols.values && cols.values()) || []);',
  '  list.forEach(function (c) {',
  '    var name = String((c && (c.displayName || c.m_strName)) || "");',
  '    if (!/^\\[Unifideck\\]/i.test(name)) return;',
  '    var label = name.replace(/^\\[Unifideck\\]\\s*/i, "").trim().toLowerCase();',
  '    if (!UF_CLOUD.has(label)) return;',
  '    var apps = (c && (c.allApps || c.m_rgApps)) || [];',
  '    for (var i = 0; i < apps.length; i++) {',
  '      var n = Number(apps[i] && apps[i].appid);',
  '      if (Number.isFinite(n)) cloudSet.add(n);',
  '    }',
  '  });',
  '  function isNonSteam(a) { var id = Number(a && (a.appid || a.m_unAppID)); return id > 0x40000000 || (a && a.app_type === 1073741824); }',
  '  // Build the owned set the way production does with (effectiveNonSteam=true, effectiveCloud=false)',
  '  var ownedSet = new Set();',
  '  var ag = appsOf(cs.allGamesCollection);',
  '  for (var k = 0; k < ag.length; k++) { var x = ag[k]; if (isNonSteam(x)) continue; var id = Number(x && (x.appid || x.m_unAppID)); if (id > 0) ownedSet.add(id); }',
  '  var mg = appsOf(cs.myGamesCollection);',
  '  for (var m = 0; m < mg.length; m++) { var y = mg[m]; if (!isNonSteam(y)) continue; var id2 = Number(y && (y.appid || y.m_unAppID)); if (cloudSet.has(id2)) continue; if (id2 > 0) ownedSet.add(id2); }',
  '  // Build the names set the way Shelf.tsx does — iterate appStore.allApps and add names for ids present in ownedSet.',
  '  var ownedNames = new Set();',
  '  var allApps = (window.appStore && window.appStore.allApps) || [];',
  '  for (var p = 0; p < allApps.length; p++) {',
  '    var ap = allApps[p];',
  '    var apid = Number(ap && ap.appid);',
  '    if (!ownedSet.has(apid)) continue;',
  '    var n2 = String((ap && (ap.display_name || ap.name)) || "");',
  '    if (n2) ownedNames.add(n2.trim().toLowerCase());',
  '  }',
  '  out.ownedSetSize = ownedSet.size;',
  '  out.ownedNamesSize = ownedNames.size;',
  '  // Did any KCD entry end up in ownedNames?',
  '  var hits = [];',
  '  ownedNames.forEach(function (n) { if (n.indexOf(QUERY) !== -1) hits.push(n); });',
  '  out.ownedNameHits = hits;',
  '  // Of the candidate IDs found, which ARE in ownedSet?',
  '  function classify(matches) {',
  '    return matches.map(function (m) { return { id: m.id, name: m.name, normalized: m.normalized, inOwnedSet: ownedSet.has(m.id), isCloud: cloudSet.has(m.id) }; });',
  '  }',
  '  out.allGamesClassified = classify(out.allGames);',
  '  out.myGamesClassified = classify(out.myGames);',
  '  out.appStoreClassified = classify(out.appStoreAllApps);',
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
