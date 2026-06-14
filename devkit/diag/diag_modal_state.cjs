#!/usr/bin/env node
// Probe the live React state of the controller + an open EditShelfModal.
// Reports:
//   - controller.collections length (drives the collection picker)
//   - shelves with sort/sortReverse currently in storage so we can see
//     whether the editor is round-tripping the multi-key state at all
//
// Usage:  node diag_modal_state.cjs <sharedjscontext-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_modal_state.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(async function () {',
  '  var out = {};',
  '  var s = window.__DECK_SHELVES_SHARED_SETTINGS__;',
  '  out.settingsExposed = !!s;',
  '  if (s) {',
  '    out.shelfCount = (s.shelves || []).length;',
  '    out.shelvesWithSort = (s.shelves || []).filter(function (sh) { return sh.sort || sh.sortReverse || (sh.source && sh.source.filter && (sh.source.filter.sort || sh.source.filter.sortReverse)); }).map(function (sh) {',
  '      var fSort = sh.source && sh.source.filter && sh.source.filter.sort;',
  '      var fRev = sh.source && sh.source.filter && sh.source.filter.sortReverse;',
  '      return { id: sh.id, title: (sh.title || "").slice(0, 30), sourceType: sh.source && sh.source.type, shelfSort: sh.sort, shelfSortReverse: sh.sortReverse, filterSort: fSort, filterSortReverse: fRev };',
  '    });',
  '    out.collectionShelfCount = (s.shelves || []).filter(function (sh) { return sh.source && sh.source.type === "collection"; }).length;',
  '  }',
  '  // Look at the dispatched EditShelfModal in DOM',
  '  var modalRoot = document.querySelector("[data-ds-edit-shelf-modal], [class*=ConfirmDialog], [class*=DialogModal]");',
  '  out.modalOpen = !!modalRoot;',
  '  // Look at any dropdown labeled with "Source" / "Coleção" - get its current value + options count.',
  '  var dropdowns = document.querySelectorAll("[class*=Dropdown]");',
  '  out.dropdownCount = dropdowns.length;',
  '  // Try collectionStore for the live count',
  '  var cs = window.collectionStore;',
  '  if (cs) {',
  '    var m = cs.m_mapCollectionsFromStorage;',
  '    out.collectionsStoreMapSize = m && typeof m.size === "number" ? m.size : ((m && m.keys && Array.from(m.keys()).length) || 0);',
  '  }',
  '  // Look for the SortField rendered rows in any open modal',
  '  var sortRows = document.querySelectorAll("[data-ds-sort-row]");',
  '  out.sortRowCount = sortRows.length;',
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
      process.stderr.write('parse failed: ' + String(e) + '\n');
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
