#!/usr/bin/env node
// Probe the SteamClient.Apps.GetAllAppOverviews output, which is what the
// online name-dedup iterates. We need to know whether non-Steam shortcuts
// are present in this list — if not, the name set will never include
// them regardless of the owned set scoping.
//
// Usage:  node diag_app_overviews.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_app_overviews.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(async function () {',
  '  var out = {};',
  '  var sc = window.SteamClient;',
  '  if (!sc || !sc.Apps) return JSON.stringify({ err: "no SteamClient.Apps" });',
  '  try {',
  '    var ov = await sc.Apps.GetAllAppOverviews();',
  '    if (Array.isArray(ov)) {',
  '      out.totalApps = ov.length;',
  '      var steam = 0, nonSteam = 0;',
  '      var nonSteamSamples = [];',
  '      for (var i = 0; i < ov.length; i++) {',
  '        var a = ov[i];',
  '        var id = Number(a && a.appid);',
  '        var isNS = id > 0x40000000 || (a && a.app_type === 1073741824);',
  '        if (isNS) {',
  '          nonSteam++;',
  '          if (nonSteamSamples.length < 6) nonSteamSamples.push({ id: id, name: a.display_name || a.name });',
  '        } else steam++;',
  '      }',
  '      out.steamCount = steam;',
  '      out.nonSteamCount = nonSteam;',
  '      out.nonSteamSamples = nonSteamSamples;',
  '    } else {',
  '      out.notArray = String(ov);',
  '    }',
  '  } catch (e) {',
  '    out.err = String(e);',
  '  }',
  '  // Also try GetMyApps and collectionStore fallback paths.',
  '  try {',
  '    if (sc.Apps.GetMyApps) {',
  '      var my = await sc.Apps.GetMyApps();',
  '      if (Array.isArray(my)) out.getMyAppsCount = my.length;',
  '    }',
  '  } catch (e) {}',
  '  // Inspect window.appStore / window.AppStore which is the fallback the plugin uses',
  '  if (window.appStore) out.appStore = { hasAllApps: !!window.appStore.allApps, allAppsLen: window.appStore.allApps && window.appStore.allApps.length };',
  '  if (window.appStore && window.appStore.m_mapApps) out.appStoreMapSize = window.appStore.m_mapApps.size;',
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
