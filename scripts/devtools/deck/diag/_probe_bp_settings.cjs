'use strict';
var ws = require('ws');
var target = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = {};
function send(method, params) { return new Promise(function (res) { var i = id++; pending[i] = res; c.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
c.on('message', function (d) { var m = JSON.parse(d); if (m.id && pending[m.id]) { pending[m.id](m.result || m.error); delete pending[m.id]; } });
c.on('open', function () {
  send('Runtime.evaluate', {
    expression: `(function(){
  var s = window.__DECK_SHELVES_SHARED_SETTINGS__;
  var cache = null;
  try { cache = JSON.parse(window.localStorage.getItem('deck-shelves-settings-cache-v3') || 'null'); } catch(e) {}
  var sh = (s && s.shelves || []).find(function(x){ return x.id === 's_7b1a8487'; })
        || (cache && cache.shelves || []).find(function(x){ return x.id === 's_7b1a8487'; });
  return {
    hasSharedSettings: !!s,
    sharedShelfCount: (s && s.shelves || []).length,
    cacheShelfCount: (cache && cache.shelves || []).length,
    shelfFromShared: !!(s && (s.shelves||[]).find(function(x){return x.id==='s_7b1a8487';})),
    shelfFromCache: !!(cache && (cache.shelves||[]).find(function(x){return x.id==='s_7b1a8487';})),
    shelfSource: sh && sh.source,
    childrenDetail: sh && sh.source && sh.source.sources ? sh.source.sources.map(function(c){
      return { type: c.type, hasFilter: !!c.filter, hasFilterGroup: !!(c.filter && c.filter.filterGroup), filterGroupItems: c.filter && c.filter.filterGroup && c.filter.filterGroup.items ? c.filter.filterGroup.items.length : 0, filterShape: c.filter ? Object.keys(c.filter) : null, fullFilter: c.filter };
    }) : null
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
