'use strict';
var ws = require('ws');
var target = process.argv[2];
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
  send('Runtime.evaluate', {
    expression: `(function(){
  // Probe the open edit modal for preview layout state.
  var modal = document.querySelector('.ModalPosition, [class*="modal"]');
  var preview = document.querySelector('[data-ds-shelf-preview="1"]');
  var previewRow = document.querySelector('[data-ds-preview-row="1"]');
  var cards = previewRow ? Array.from(previewRow.querySelectorAll('.ds-card[data-appid]')) : [];
  var firstCard = cards[0];
  // Highlight / hidden cards in the modal
  var withMark = previewRow ? Array.from(previewRow.querySelectorAll('.ds-card')).filter(function(c){
    var children = c.querySelectorAll('div, svg');
    return Array.from(children).some(function(x){ var s = getComputedStyle(x); return s.outline && s.outline.indexOf('rgb') >= 0 && s.outline.indexOf('0px') < 0; });
  }).map(function(c){ return { rect: c.getBoundingClientRect(), classes: c.className }; }) : [];
  return {
    hasModal: !!modal,
    hasPreview: !!preview,
    previewRowRect: previewRow ? previewRow.getBoundingClientRect() : null,
    cardCount: cards.length,
    firstCardRect: firstCard ? firstCard.getBoundingClientRect() : null,
    firstCardClasses: firstCard ? firstCard.className : null,
    overflowX: previewRow ? getComputedStyle(previewRow).overflowX : null,
    overflowY: previewRow ? getComputedStyle(previewRow).overflowY : null,
    markedCount: withMark.length,
    // Active tab text
    activeTab: (function(){
      var t = document.querySelector('[class*="tab-active"], [aria-selected="true"]');
      return t ? t.textContent : null;
    })(),
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
