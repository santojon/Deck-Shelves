'use strict';
var ws = require('ws');
var target = process.argv[2];
var tabId = process.argv[3] || 'filters';
var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var id = 1; var pending = {};
function send(method, params) { return new Promise(function (res) { var i = id++; pending[i] = res; c.send(JSON.stringify({ id: i, method: method, params: params || {} })); }); }
c.on('message', function (d) { var m = JSON.parse(d); if (m.id && pending[m.id]) { pending[m.id](m.result || m.error); delete pending[m.id]; } });
c.on('open', function () {
  send('Runtime.evaluate', {
    expression: `(async function(){
  // Find tab buttons inside the modal form
  var form = document.querySelector('form');
  if (!form) return { err: 'no form' };
  var tabs = form.querySelectorAll('[class*="Tab"][class*="Label"], [role="tab"], button');
  var targetEl = null;
  var labels = Array.from(tabs).map(function(b){ return (b.textContent || '').trim(); });
  // Match by tab label heuristically — "Filtros" or "Filters"
  for (var i = 0; i < tabs.length; i++) {
    var txt = (tabs[i].textContent || '').trim().toLowerCase();
    if (txt.indexOf('filtro') === 0 || txt.indexOf('filter') === 0) { targetEl = tabs[i]; break; }
  }
  if (!targetEl) return { err: 'no filters tab found', labels: labels.slice(0, 20) };
  targetEl.click();
  await new Promise(function(r){ setTimeout(r, 400); });
  // Now probe the preview row again
  var firstCard = form.querySelector('.ds-card');
  if (!firstCard) return { err: 'no card after switch' };
  var chain = [];
  var n = firstCard;
  for (var k = 0; k < 8 && n && n !== form; k++) {
    var s = getComputedStyle(n);
    var r = n.getBoundingClientRect();
    chain.push({
      tag: n.tagName,
      cls: typeof n.className === 'string' ? n.className.slice(0, 60) : '',
      width: n.clientWidth,
      scrollWidth: n.scrollWidth,
      overflowX: s.overflowX,
      visible: r.top < window.innerHeight && r.bottom > 0
    });
    n = n.parentElement;
  }
  return { switchedTo: 'filters', chain: chain };
})()`,
    returnByValue: true, awaitPromise: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
