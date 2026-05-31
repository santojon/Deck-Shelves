'use strict';
var ws = require('ws');
var target = process.argv[2];
var shelfId = process.argv[3];
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = {};
function send(method, params) { return new Promise(function (res) { var i = id++; pending[i] = res; c.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
c.on('message', function (d) { var m = JSON.parse(d); if (m.id && pending[m.id]) { pending[m.id](m.result || m.error); delete pending[m.id]; } });
c.on('open', function () {
  send('Runtime.evaluate', {
    expression: `(function(){
  var doc = document;
  var shelfEl = doc.querySelector('[data-shelfid="${shelfId}"]');
  var rendered = shelfEl ? shelfEl.querySelectorAll('.ds-card[data-appid]').length : -1;
  var s = window.__DECK_SHELVES_SHARED_SETTINGS__ || JSON.parse(window.localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
  var sh = (s.shelves || []).find(function(x){ return x.id === '${shelfId}'; });
  var src = sh && sh.source;
  // Check the cache key used by Shelf.tsx
  var sortKey = sh && sh.sort ? sh.sort : '';
  var cacheKey = 'ds-shelf-cache-${shelfId}-' + sortKey + '-' + ((sh && sh.manualBaseSort) || '') + '-' + ((sh && sh.sortReverse) ? 'r1' : 'r0') + '-r0';
  var cached = null;
  try { cached = JSON.parse(window.localStorage.getItem(cacheKey) || 'null'); } catch(e) {}
  return {
    renderedCardCount: rendered,
    shelfEl: !!shelfEl,
    childTypes: src && src.sources ? src.sources.map(function(c){ return c.type; }) : null,
    childFilterItems: src && src.sources && src.sources[2] && src.sources[2].filter && src.sources[2].filter.filterGroup ? src.sources[2].filter.filterGroup.items.length : 0,
    cacheKey: cacheKey,
    cachedIdsCount: cached && cached.ids ? cached.ids.length : 0,
    firstFewCachedIds: cached && cached.ids ? cached.ids.slice(0, 12) : null
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
