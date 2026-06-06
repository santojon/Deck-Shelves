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
      "  // Find the native recents row by walking outside DS\n" +
      "  var ds = document.getElementById('deck-shelves-home-root');\n" +
      "  // Native shelf items typically: image background + label, in a Focusable with role=link\n" +
      "  var anyFocusable = Array.from(document.querySelectorAll('.Focusable[tabindex]')).filter(el => !(ds && ds.contains(el)));\n" +
      "  // Filter to ones that contain an img with steamloopback.host or assets path\n" +
      "  var cards = anyFocusable.filter(el => {\n" +
      "    var imgs = el.querySelectorAll('img');\n" +
      "    for (var i=0;i<imgs.length;i++){\n" +
      "      var src = imgs[i].src || '';\n" +
      "      if (/\\/(assets|customimages|library_)/i.test(src)) return true;\n" +
      "    }\n" +
      "    return false;\n" +
      "  });\n" +
      "  // First and one focused\n" +
      "  var first = cards[0];\n" +
      "  var focused = cards.find(el => el.classList.contains('gpfocus') || el.matches(':focus') || el.classList.contains('gpfocuswithin'));\n" +
      "  function descAll(el){\n" +
      "    if(!el) return null;\n" +
      "    var cs = getComputedStyle(el);\n" +
      "    return {\n" +
      "      tag: el.tagName.toLowerCase(),\n" +
      "      cls: el.className.split(' ').slice(0, 3).join(' '),\n" +
      "      transition: cs.transition,\n" +
      "      transform: cs.transform,\n" +
      "      transformOrigin: cs.transformOrigin,\n" +
      "      animation: cs.animation,\n" +
      "      boxShadow: cs.boxShadow.length > 80 ? cs.boxShadow.slice(0, 80) + '...' : cs.boxShadow,\n" +
      "      zIndex: cs.zIndex,\n" +
      "      opacity: cs.opacity\n" +
      "    };\n" +
      "  }\n" +
      "  function dump(el){ return { self: descAll(el), child0: descAll(el && el.firstElementChild), parent: descAll(el && el.parentElement) }; }\n" +
      "  return JSON.stringify({\n" +
      "    cardCount: cards.length,\n" +
      "    first: first ? dump(first) : null,\n" +
      "    focused: focused ? dump(focused) : null,\n" +
      "  });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
