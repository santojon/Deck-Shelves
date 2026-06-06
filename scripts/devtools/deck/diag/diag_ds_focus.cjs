// Probe a focused DS card to confirm transition + transform + shadow
// rules took effect after the deploy.
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
      "  function desc(el){ if(!el) return null; var cs=getComputedStyle(el); return { cls: (el.className||'').toString().split(' ').slice(0,2).join(' '), transform: cs.transform, transition: cs.transition, boxShadow: cs.boxShadow }; }\n" +
      "  var cards = document.querySelectorAll('#deck-shelves-home-root .ds-card');\n" +
      "  if (!cards.length) return JSON.stringify({nope: 1});\n" +
      "  var first = cards[0];\n" +
      "  var focused = null;\n" +
      "  for (var i=0; i<cards.length; i++){ if (cards[i].classList.contains('gpfocus') || cards[i].matches(':focus')){ focused = cards[i]; break; } }\n" +
      "  return JSON.stringify({\n" +
      "    cardCount: cards.length,\n" +
      "    firstCard: desc(first),\n" +
      "    focusedCard: desc(focused),\n" +
      "    badgeInside: first.querySelector('.ds-card-badge-host--inline') ? desc(first.querySelector('.ds-card-badge-host--inline')) : null,\n" +
      "  });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
