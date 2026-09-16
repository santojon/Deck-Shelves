#!/usr/bin/env node
// Run resolveShelfAppIds against the composite source on the live page
// and break down what each child returns vs the final merged result.
// Usage: node diag_composite_resolve.cjs <bp-target-id> <shelf-id>
'use strict';
var ws = require('ws');
var target = process.argv[2];
var shelfId = process.argv[3] || 's_7b1a8487';
if (!target) { process.stderr.write('Usage: diag_composite_resolve.cjs <target> [shelfId]\n'); process.exit(2); }
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = new Map();
function send(method, params) { return new Promise(function (res) { var i = id++; pending.set(i, res); c.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
c.on('message', function (d) {
  var m = JSON.parse(d);
  if (typeof m.id !== 'number') return;
  var resolver = pending.get(m.id);
  if (typeof resolver !== 'function') return;
  pending.delete(m.id);
  resolver(m.result || m.error);
});
c.on('open', function () {
  var script = '(async function(){\n' +
    'try {\n' +
    '  var s = window.__DECK_SHELVES_SHARED_SETTINGS__ || JSON.parse(window.localStorage.getItem("deck-shelves-settings-cache-v3") || "{}");\n' +
    '  var sh = (s.shelves || []).find(function (x) { return x.id === ' + JSON.stringify(shelfId) + '; });\n' +
    '  if (!sh) return { error: "shelf not found" };\n' +
    '  var src = sh.source;\n' +
    '  if (src.type !== "composite") return { error: "not composite", type: src.type };\n' +
    '  // Resolve each child individually via the plugin\'s resolver.\n' +
    '  var api = window.__DECK_SHELVES_API__;\n' +
    '  if (!api) return { error: "no DS API exposed" };\n' +
    '  // Locate resolveShelfAppIds — not exposed via the public API.\n' +
    '  // Walk the loaded chunks for `resolveShelfAppIds` symbol.\n' +
    '  // Easier path: trigger a resolve via dispatchEvent to force the\n' +
    '  // home shelf to re-render and observe the rendered card count.\n' +
    '  var rendered = 0;\n' +
    '  try {\n' +
    '    var doc = document;\n' +
    '    var shelfEl = doc.querySelector("[data-shelfid=\\"" + sh.id + "\\"]");\n' +
    '    if (shelfEl) rendered = shelfEl.querySelectorAll(".ds-card[data-appid]").length;\n' +
    '  } catch (e) {}\n' +
    '  var cacheKey = "ds-shelf-cache-" + sh.id + "-" + (sh.sort ?? "") + "--" + (sh.sortReverse ? "r1" : "r0") + "-r0";\n' +
    '  var cached = null;\n' +
    '  try { cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null"); } catch (e) {}\n' +
    '  return {\n' +
    '    shelfId: sh.id,\n' +
    '    title: sh.title,\n' +
    '    combine: src.combine,\n' +
    '    childTypes: (src.sources || []).map(function (c) { return c.type; }),\n' +
    '    renderedCardCount: rendered,\n' +
    '    cacheKey: cacheKey,\n' +
    '    cachedIdsCount: cached && cached.ids ? cached.ids.length : 0,\n' +
    '    firstFewCachedIds: cached && cached.ids ? cached.ids.slice(0, 8) : null,\n' +
    '  };\n' +
    '} catch (e) { return { error: String(e) }; }\n' +
    '})()';
  send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true })
    .then(function (r) {
      process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
      c.close(); process.exit(0);
    });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
