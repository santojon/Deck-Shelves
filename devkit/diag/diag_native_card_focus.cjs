var ws = require('ws');
var target = process.argv[2];
var c = new ws('ws://192.168.1.15:8081/devtools/page/' + target);
var id = 0;
function send(m, p, cb) {
  var i = ++id;
  c.on('message', function h(d){ var x=JSON.parse(d); if(x.id===i){ c.removeListener('message',h); cb(x.error,x.result);}});
  c.send(JSON.stringify({id:i,method:m,params:p||{}}));
}

c.on('open', function() {
  send('Runtime.enable', {}, function() {
    var expr = "(function(){\n" +
      "  var ds = document.getElementById('deck-shelves-home-root');\n" +
      "  // Find actual native game tiles by href pattern\n" +
      "  var tiles = Array.from(document.querySelectorAll('[href*=\"/library/app/\"]')).filter(el => !(ds && ds.contains(el)));\n" +
      "  function descAll(el){\n" +
      "    if(!el) return null;\n" +
      "    var cs = getComputedStyle(el);\n" +
      "    return {\n" +
      "      tag: el.tagName.toLowerCase(),\n" +
      "      cls: el.className,\n" +
      "      transition: cs.transition,\n" +
      "      transform: cs.transform,\n" +
      "      transformOrigin: cs.transformOrigin,\n" +
      "      willChange: cs.willChange,\n" +
      "      animation: cs.animation,\n" +
      "      boxShadow: cs.boxShadow,\n" +
      "      filter: cs.filter,\n" +
      "      zIndex: cs.zIndex,\n" +
      "    };\n" +
      "  }\n" +
      "  function chain(el, n){ var out=[]; for(var i=0;i<n && el;i++){ out.push(descAll(el)); el = el.parentElement; } return out; }\n" +
      "  var tile = tiles[0];\n" +
      "  // Find a focused one if any, else use first\n" +
      "  for(var i=0;i<tiles.length;i++){ if(tiles[i].classList.contains('gpfocus') || tiles[i].matches(':focus')){ tile = tiles[i]; break; } }\n" +
      "  return JSON.stringify({\n" +
      "    tilesFound: tiles.length,\n" +
      "    focused: tile && (tile.classList.contains('gpfocus') || tile.matches(':focus')),\n" +
      "    sample: tile ? chain(tile, 7) : null,\n" +
      "    inner: tile ? Array.from(tile.children).slice(0, 4).map(descAll) : []\n" +
      "  });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
