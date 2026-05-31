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
  var form = document.querySelector('form');
  if (!form) return { err: 'no form' };
  var firstCard = form.querySelector('.ds-card');
  if (!firstCard) return { err: 'no card' };
  var chain = [];
  var n = firstCard;
  for (var i = 0; i < 8 && n && n !== form; i++) {
    var s = getComputedStyle(n);
    chain.push({
      tag: n.tagName,
      cls: typeof n.className === 'string' ? n.className.slice(0, 70) : '',
      width: n.clientWidth,
      scrollWidth: n.scrollWidth,
      overflowX: s.overflowX,
      margin: s.marginLeft + ' / ' + s.marginRight,
      padding: s.paddingLeft + ' / ' + s.paddingRight,
    });
    n = n.parentElement;
  }
  return { chain: chain };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
