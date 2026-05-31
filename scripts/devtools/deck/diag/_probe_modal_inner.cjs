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
  var cards = form.querySelectorAll('.ds-card');
  // Find horizontal scrollers inside the modal
  var scrollers = [];
  var all = form.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var s = getComputedStyle(all[i]);
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
      if (all[i].scrollWidth > all[i].clientWidth + 4) {
        scrollers.push({
          tag: all[i].tagName,
          cls: typeof all[i].className === 'string' ? all[i].className.slice(0, 80) : '',
          rect: all[i].getBoundingClientRect(),
          scrollWidth: all[i].scrollWidth, clientWidth: all[i].clientWidth, scrollLeft: all[i].scrollLeft,
        });
      }
    }
  }
  var card0 = cards[0];
  var card0Rect = card0 ? card0.getBoundingClientRect() : null;
  // Inspect overlays applied
  var markers = [];
  cards.forEach(function(c){
    var has = c.querySelector('svg[aria-hidden]');
    if (has) {
      var marker = c.querySelector('div[aria-hidden] + div, div[style*="outline"]');
      markers.push({ rect: c.getBoundingClientRect(), iconRect: has.getBoundingClientRect(), iconViewBox: has.getAttribute('viewBox') });
    }
  });
  return {
    cardCount: cards.length,
    firstCardClass: card0 ? card0.className.slice(0, 90) : null,
    firstCardRect: card0Rect,
    scrollers: scrollers.slice(0, 6),
    markersCount: markers.length,
    firstMarker: markers[0] || null,
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
