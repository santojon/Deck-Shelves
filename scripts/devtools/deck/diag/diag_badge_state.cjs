// Deep probe of the badge overlay state — focused card data
// attrs, overlay presence/visibility, and what the CSS rule says.
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
      "  var focused = document.querySelector('.ds-card.gpfocus, .ds-card:focus');\n" +
      "  var overlay = document.querySelector('.ds-card-badge-host--overlay');\n" +
      "  var rect = overlay ? overlay.getBoundingClientRect() : null;\n" +
      "  var cs = overlay ? getComputedStyle(overlay) : null;\n" +
      "  var atPoint = rect ? document.elementFromPoint(rect.left + rect.width/2, rect.top + 4) : null;\n" +
      "  var inner = overlay ? overlay.querySelector('.ds-new-badge') : null;\n" +
      "  var innerCs = inner ? getComputedStyle(inner) : null;\n" +
      "  return JSON.stringify({\n" +
      "    focusedAppid: focused ? focused.getAttribute('data-appid') : null,\n" +
      "    overlayPresent: !!overlay,\n" +
      "    overlayRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,\n" +
      "    overlayStyle: cs ? { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex } : null,\n" +
      "    overlayInnerBadge: inner ? inner.textContent : null,\n" +
      "    overlayInnerStyle: innerCs ? { display: innerCs.display, background: innerCs.background.slice(0, 80), color: innerCs.color, padding: innerCs.padding } : null,\n" +
      "    elementAtBadgePoint: atPoint ? { tag: atPoint.tagName, cls: (atPoint.className||'').toString().slice(0, 80) } : null\n" +
      "  });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
