#!/usr/bin/env node
// Persisted-shelf sort probe — dumps the live plugin settings (via the
// backend `get_settings` call exposed on `decky.call`) with a focus on
// each shelf's `sort` / `sortReverse`. Used to verify multi-key sort
// arrays survive the round trip from React editor → Python sanitizer →
// settings store.
//
// Usage:  node diag_shelves_sort.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_shelves_sort.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

// Walk likely plugin globals; whichever one exposes `call` for our
// plugin gets used to hit `get_settings`. Decky exposes plugin methods
// via `window.DeckyPluginLoader` or via the plugin's own `decky.call`.
var expression = [
  '(async function () {',
  '  function locateCallable() {',
  '    var loader = window.DeckyPluginLoader || window.DECKY_LOADER;',
  '    if (loader) {',
  '      // Decky 3 exposes plugins via loader.plugins (Map of name -> {pluginInfo, callable})',
  '      // Try as Map first, fall back to plain object.',
  '      var plist = null;',
  '      if (loader.plugins instanceof Map) plist = Array.from(loader.plugins.values());',
  '      else if (loader.plugins && typeof loader.plugins === "object") plist = Object.values(loader.plugins);',
  '      if (plist) {',
  '        var keys = [];',
  '        for (var i = 0; i < plist.length; i++) {',
  '          var p = plist[i];',
  '          var name = p && (p.name || (p.pluginInfo && p.pluginInfo.name));',
  '          keys.push(name);',
  '          if (typeof name === "string" && (name.toLowerCase().includes("shelves") || name === "Deck Shelves" || name === "deck-shelves")) {',
  '            var cb = p.callable || (p.callPluginMethod) || (p.pluginInfo && p.pluginInfo.callable);',
  '            if (cb) return { call: cb, name: name };',
  '          }',
  '        }',
  '        return { err: "no shelves plugin found", names: keys };',
  '      }',
  '    }',
  '    return { err: "no plugin loader" };',
  '  }',
  '  var loc = locateCallable();',
  '  if (loc.err) return JSON.stringify(loc);',
  '  try {',
  '    var s = await loc.call("get_settings", []);',
  '    var shelves = (s && Array.isArray(s.shelves)) ? s.shelves : [];',
  '    var out = shelves.map(function (sh) {',
  '      return { id: sh.id, title: sh.title, sort: sh.sort, sortReverse: sh.sortReverse, sourceType: sh.source && sh.source.type };',
  '    });',
  '    return JSON.stringify({ total: shelves.length, shelves: out.slice(0, 12) });',
  '  } catch (e) {',
  '    return JSON.stringify({ err: "call failed: " + String(e) });',
  '  }',
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
