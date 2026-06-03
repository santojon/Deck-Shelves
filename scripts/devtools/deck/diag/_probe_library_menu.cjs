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
  // Search globally — context menus often render in a portal at the doc root
  var allMenus = document.querySelectorAll('.contextMenu, [class*="contextMenu"], [class*="ContextMenu"], [class*="Menu"][role="menu"]');
  var visible = [];
  allMenus.forEach(function(m){
    var r = m.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      var items = m.querySelectorAll('[class*="MenuItem"], [role="menuitem"]');
      visible.push({
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        cls: typeof m.className === 'string' ? m.className.slice(0, 80) : '',
        itemCount: items.length,
        itemLabels: Array.from(items).map(function(i){ return (i.textContent || '').trim().slice(0, 60); })
      });
    }
  });
  return {
    menuCount: visible.length,
    menus: visible.slice(0, 5),
    // Check whether the inner DS menu has Add to shelf
    hasAddToShelf: visible.some(function(m){ return m.itemLabels.some(function(l){ return l.toLowerCase().indexOf('adicionar') >= 0 || l.toLowerCase().indexOf('add to') >= 0; }); }),
    hasDecksShelvesGroup: visible.some(function(m){ return m.itemLabels.some(function(l){ return l.toLowerCase().indexOf('prateleira') >= 0 || l.toLowerCase().indexOf('deck shelves') >= 0 || l.toLowerCase().indexOf('shelf') >= 0; }); })
  };
})()`,
    returnByValue: true
  }).then(function (r) {
    process.stdout.write(JSON.stringify((r && r.result && r.result.value) || r, null, 2) + '\n');
    c.close(); process.exit(0);
  });
});
c.on('error', function (e) { process.stderr.write(String(e) + '\n'); process.exit(2); });
