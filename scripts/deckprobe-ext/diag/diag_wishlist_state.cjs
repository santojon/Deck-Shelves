#!/usr/bin/env node
// Tail the plugin's runtime log buffer (captured by the page's console)
// looking for the most recent wishlist resolution warnings, so we can
// see WHAT exception (if any) the wishlist try/catch is swallowing.
//
// Usage:  node diag_wishlist_state.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_wishlist_state.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

// Enable Log + Runtime domains, listen for console events for 6s, then
// trigger a wishlist re-resolve (clear cache + reload).
client.on('open', function () {
  var captured = [];
  function send(method, params) {
    var id = msgId++;
    client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    return id;
  }
  send('Log.enable');
  send('Runtime.enable');
  client.on('message', function (data) {
    var m = JSON.parse(data);
    if (m.method === 'Log.entryAdded') {
      var t = m.params.entry.text || '';
      if (/wishlist|STEAM|shelf/i.test(t)) captured.push({ lvl: m.params.entry.level, src: m.params.entry.source, txt: t.slice(0, 300) });
    } else if (m.method === 'Runtime.consoleAPICalled') {
      var args = (m.params.args || []).map(function (a) { return (a.value || a.description || a.type || '').toString().slice(0, 200); });
      var line = args.join(' | ');
      if (/wishlist|STEAM|shelf/i.test(line)) captured.push({ src: 'console', lvl: m.params.type, txt: line });
    } else if (m.method === 'Runtime.exceptionThrown') {
      captured.push({ src: 'exception', lvl: 'error', txt: (m.params.exceptionDetails.text || '') + ' ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 400) });
    }
  });
  // Force a fresh resolution: clear shelf cache, dispatch a re-render
  send('Runtime.evaluate', { expression: '(function () { var s = window.__DECK_SHELVES_SHARED_SETTINGS__; var wish = (s.shelves || []).find(function (sh) { return sh.source && sh.source.type === "wishlist"; }); if (!wish) return "no wish shelf"; var sortKey = Array.isArray(wish.sort) ? wish.sort.join(",") : (wish.sort || ""); var cacheKey = "ds-shelf-cache-" + wish.id + "-" + sortKey + "--" + (wish.sortReverse ? "r1" : "r0") + "-r0"; window.localStorage.removeItem(cacheKey); window.dispatchEvent(new CustomEvent("ds-trigger-shelf-refresh", { detail: { shelfId: wish.id, manual: true } })); return "cache cleared + refresh dispatched"; })()' });
  setTimeout(function () {
    process.stdout.write(JSON.stringify({ captured: captured.length, entries: captured.slice(0, 30) }, null, 2) + '\n');
    client.close();
    process.exit(0);
  }, 6000);
});

client.on('error', function (e) {
  process.stderr.write('CDP connection failed: ' + String(e) + '\n');
  process.exit(2);
});
