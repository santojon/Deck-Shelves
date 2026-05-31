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
  // Locate all ds-card instances in any frame and their wrappers
  var cards = document.querySelectorAll('.ds-card[data-appid]');
  var rows = document.querySelectorAll('[class*="ManualSort"], [class*="HighlightRow"], [data-ds-shelf-preview], [data-ds-preview-row]');
  var modalRoot = document.querySelector('.ModalPosition');
  // Find the deepest scrollable in the modal
  var scrollers = [];
  if (modalRoot) {
    var all = modalRoot.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var s = getComputedStyle(all[i]);
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && all[i].scrollWidth > all[i].clientWidth) {
        scrollers.push({
          tag: all[i].tagName,
          cls: all[i].className && typeof all[i].className === 'string' ? all[i].className.slice(0, 80) : '',
          w: all[i].clientWidth, sw: all[i].scrollWidth,
          rect: { left: all[i].getBoundingClientRect().left, right: all[i].getBoundingClientRect().right }
        });
      }
    }
  }
  return {
    cardCount: cards.length,
    firstCardClass: cards[0] ? cards[0].className.slice(0, 100) : null,
    rowSelectors: Array.from(rows).map(function(r){ return r.tagName + '.' + (r.className && typeof r.className === 'string' ? r.className.slice(0, 60) : ''); }),
    horizontalScrollers: scrollers.slice(0, 8),
    modalRootClass: modalRoot ? (modalRoot.className && typeof modalRoot.className === 'string' ? modalRoot.className.slice(0, 60) : '') : null,
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
