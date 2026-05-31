#!/usr/bin/env node
// Inspect a composite shelf with a filter child — confirms shape on
// disk and what each child resolver returns. Usage:
//   node diag_composite_filter.cjs <bp-target-id>
'use strict';
var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stderr.write('Usage: diag_composite_filter.cjs <target>\n'); process.exit(2); }
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = {};
function send(method, params) {
  return new Promise(function (res) { var i = id++; pending[i] = res; c.send(JSON.stringify({ id: i, method: method, params: params || {} })); });
}
c.on('message', function (d) { var m = JSON.parse(d); if (m.id && pending[m.id]) { pending[m.id](m.result || m.error); delete pending[m.id]; } });
c.on('open', function () {
  send('Runtime.evaluate', {
    expression: '(' + (function () {
      var out = { composites: [], note: '' };
      try {
        var s = window.__DECK_SHELVES_SHARED_SETTINGS__;
        if (!s) {
          try { s = JSON.parse(window.localStorage.getItem('deck-shelves-settings-cache-v3') || '{}'); } catch (e) {}
        }
        if (!s) { out.note = 'no settings'; return out; }
        var shelves = s.shelves || [];
        for (var i = 0; i < shelves.length; i++) {
          var sh = shelves[i];
          var src = sh.source || {};
          if (src.type !== 'composite') continue;
          var children = Array.isArray(src.sources) ? src.sources : [];
          out.composites.push({
            id: sh.id,
            title: sh.title,
            combine: src.combine,
            childCount: children.length,
            children: children.map(function (cc, ci) {
              return {
                idx: ci,
                type: cc && cc.type,
                hasFilter: !!(cc && cc.filter),
                hasFilterGroup: !!(cc && cc.filter && cc.filter.filterGroup),
                filterGroupItems: cc && cc.filter && cc.filter.filterGroup && Array.isArray(cc.filter.filterGroup.items) ? cc.filter.filterGroup.items.length : 0,
                rawFilter: cc && cc.filter ? Object.keys(cc.filter) : null,
                shape: cc && cc.type === 'tab' ? { tab: cc.tab } : cc && cc.type === 'collection' ? { collectionId: cc.collectionId } : null,
              };
            }),
          });
        }
      } catch (e) { out.note = String(e); }
      return out;
    }).toString() + ')()',
    returnByValue: true,
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
