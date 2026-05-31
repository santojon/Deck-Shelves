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
  // Inspect the plugin's runtime state for LibraryContextMenu patching.
  return {
    libraryContextMenuPatched: typeof window.__DECK_SHELVES_DEBUG__ !== 'undefined' && window.__DECK_SHELVES_DEBUG__.libraryContextMenuPatched,
    apiExposed: typeof window.__DECK_SHELVES_API__ === 'object',
    apiKeys: typeof window.__DECK_SHELVES_API__ === 'object' ? Object.keys(window.__DECK_SHELVES_API__).slice(0, 10) : null,
    // Plugin version
    sharedSettings: !!window.__DECK_SHELVES_SHARED_SETTINGS__,
    cacheVersion: (function(){
      try { return Object.keys(JSON.parse(window.localStorage.getItem('deck-shelves-settings-cache-v3') || '{}')).length; } catch (e) { return 'err'; }
    })(),
    // Discover what menu classes Steam exposes
    hasAppContextMenu: typeof window.SP_REACT !== 'undefined',
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
