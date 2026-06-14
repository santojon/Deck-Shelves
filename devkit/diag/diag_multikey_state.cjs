#!/usr/bin/env node
// Snapshot every shelf that uses a multi-key sort and dump the
// resolved app ids together with the per-key values for the first
// ~12 items so we can manually verify the primary/secondary chain.
// Usage:  node diag_multikey_state.cjs <sharedjscontext-target>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stderr.write('Usage: diag_multikey_state.cjs <target>\n'); process.exit(2); }

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = new Map();
function send(method, params) {
  return new Promise(function (res) {
    var i = id++;
    pending.set(i, res);
    c.send(JSON.stringify({ id: i, method: method, params: params || {} }));
  });
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
  send('Runtime.evaluate', { expression: '(' + (function () {
    var s = window.__DECK_SHELVES_SHARED_SETTINGS__;
    if (!s) {
      try { var raw = window.localStorage.getItem('deck-shelves-settings'); if (raw) s = JSON.parse(raw); } catch (e) {}
    }
    if (!s) {
      var keys = [];
      try { for (var k = 0; k < window.localStorage.length; k++) { var key = window.localStorage.key(k); if (key && /deck.?shelves|ds-/i.test(key)) keys.push(key); } } catch (e) {}
      return { err: 'no settings', lsKeys: keys.slice(0, 20) };
    }
    var collStore = window.collectionStore;
    var appStore = window.appStore;
    var out = [];
    for (var i = 0; i < (s.shelves || []).length; i++) {
      var sh = s.shelves[i];
      var src = sh.source || {};
      var isFilter = src.type === 'filter';
      var sort = isFilter ? (src.filter && src.filter.sort) : sh.sort;
      var rev = isFilter ? (src.filter && src.filter.sortReverse) : sh.sortReverse;
      if (!Array.isArray(sort) || sort.length < 2) continue;
      var cacheKey = 'ds-shelf-cache-' + sh.id + '-' + (Array.isArray(sh.sort) ? sh.sort.join(',') : (sh.sort || '')) + '--' + (Array.isArray(sh.sortReverse) ? (sh.sortReverse[0] ? 'r1' : 'r0') : (sh.sortReverse ? 'r1' : 'r0')) + '-r0';
      var cached = null;
      try { var raw = window.localStorage.getItem(cacheKey); if (raw) cached = JSON.parse(raw); } catch (e) {}
      var ids = (cached && cached.ids) || [];
      var sample = [];
      for (var j = 0; j < Math.min(ids.length, 12); j++) {
        var aid = ids[j];
        var ov = (appStore && appStore.GetAppOverviewByAppID) ? appStore.GetAppOverviewByAppID(aid) : null;
        var row = { appid: aid, name: ov && (ov.display_name || ov.name) || ('App ' + aid) };
        if (ov) {
          row.recent = Number(ov.rt_last_time_played || 0);
          row.playtime = Number(ov.playtime_forever || 0);
          row.release = Number(ov.rt_original_release_date || 0);
          row.metacritic = Number(ov.metacritic_score || 0);
          row.review = Number(ov.review_percentage || 0);
          row.size = Number(ov.size_on_disk || 0);
          row.deck_compat = Number(ov.deck_compatibility_category || 0);
        }
        sample.push(row);
      }
      out.push({
        id: sh.id, name: sh.name, sourceType: src.type, sourceMode: src.mode,
        topLevelSort: sh.sort, topLevelReverse: sh.sortReverse,
        filterSort: isFilter ? (src.filter && src.filter.sort) : undefined,
        filterReverse: isFilter ? (src.filter && src.filter.sortReverse) : undefined,
        cachedCount: ids.length,
        cacheKey: cacheKey,
        sample: sample
      });
    }
    return out;
  }).toString() + ')()', returnByValue: true })
  .then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
