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
  // Find anything that looks like a modal
  var byTitle = document.querySelectorAll('[role="dialog"], [class*="Modal"], [class*="dialog"]');
  var preview = document.querySelectorAll('[data-ds-shelf-preview]');
  var rows = document.querySelectorAll('[data-ds-preview-row]');
  // Look for the Source tab content
  return {
    candidates: Array.from(byTitle).slice(0, 5).map(function(el){
      return { tag: el.tagName, cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), text: (el.textContent || '').slice(0, 50) };
    }),
    previewCount: preview.length,
    rowCount: rows.length,
    domDepth: document.querySelectorAll('*').length,
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
