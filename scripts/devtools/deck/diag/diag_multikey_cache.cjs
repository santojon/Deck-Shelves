#!/usr/bin/env node
// Read a specific multi-key shelf cache and dump per-key values for
// the first ~15 entries so we can manually verify the chain ordering.
// Usage:  node diag_multikey_cache.cjs <target> <cacheKey>
'use strict';
var ws = require('ws');
var target = process.argv[2];
var cacheKey = process.argv[3] || 'ds-shelf-cache-s_5452efd8-discount_high,metacritic--r0-r0';
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = new Map();
function send(method, params) {
  return new Promise(function (res) { var i = id++; pending.set(i, res); c.send(JSON.stringify({ id: i, method: method, params: params || {} })); });
}
c.on('message', function (d) {
  var m = JSON.parse(d);
  if (typeof m.id !== 'number') return;
  var resolver = pending.get(m.id);
  if (typeof resolver !== 'function') return;
  pending.delete(m.id);
  resolver(m.result || m.error);
});
c.on('open', function () {
  send('Runtime.evaluate', {
    expression: '(function(){ var raw = window.localStorage.getItem(' + JSON.stringify(cacheKey) + '); if (!raw) return {err:"no cache"}; var c = JSON.parse(raw); var ids = c.ids || []; var pc = null; try { pc = JSON.parse(window.localStorage.getItem("ds-price-cache-v1")||"{}"); } catch(e){} var out=[]; for (var i=0;i<Math.min(ids.length,15);i++){ var aid=ids[i]; var ov = window.appStore && window.appStore.GetAppOverviewByAppID(aid); var pe = pc && pc[aid] && pc[aid].data; out.push({i:i, appid:aid, name: ov?(ov.display_name||ov.name):("App "+aid), discount: pe?pe.discount:null, price: pe?pe.price:null, metacritic: ov?(ov.metacritic_score||0):null, recent: ov?Number(ov.rt_last_time_played||0):null, playtime: ov?Number(ov.playtime_forever||0):null}); } return {age:Math.round((Date.now()-c.ts)/1000)+"s", count: ids.length, sample: out}; })()',
    returnByValue: true
  }).then(function (r) { process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n'); c.close(); process.exit(0); });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
