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
  var shelfEl = document.querySelector('[data-shelfid="${shelfId}"]');
  if (!shelfEl) return { err: 'no shelf el' };
  var ids = Array.from(shelfEl.querySelectorAll('.ds-card[data-appid]')).map(function(c){ return Number(c.getAttribute('data-appid')); });
  // Filter child's filterGroup items
  var s = window.__DECK_SHELVES_SHARED_SETTINGS__ || {};
  var sh = (s.shelves||[]).find(function(x){ return x.id === '${shelfId}'; });
  var filterChild = sh && sh.source && sh.source.sources && sh.source.sources[2];
  var fgItems = filterChild && filterChild.filter && filterChild.filter.filterGroup ? filterChild.filter.filterGroup.items : null;
  return {
    cardCount: ids.length,
    appids: ids,
    filterChildSort: filterChild && filterChild.filter && filterChild.filter.sort,
    filterGroupItems: fgItems,
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
