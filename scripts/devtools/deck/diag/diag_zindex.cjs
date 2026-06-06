var ws = require('ws');
var c = new ws('ws://192.168.1.15:8081/devtools/page/' + process.argv[2]);
var id = 0;
function send(m, p, cb) { var i=++id; c.on('message', function h(d){var x=JSON.parse(d);if(x.id===i){c.removeListener('message',h);cb(x.error,x.result);}}); c.send(JSON.stringify({id:i,method:m,params:p||{}})); }
c.on('open', function() {
  send('Runtime.enable', {}, function() {
    var expr = "(function(){\n" +
      "  var bodyKids = Array.from(document.body.children).map(el => { var cs=getComputedStyle(el); return { tag: el.tagName, id: el.id, cls: (el.className||'').toString().slice(0,50), zIndex: cs.zIndex, position: cs.position }; });\n" +
      "  var overlay = document.querySelector('.ds-card-badge-host--overlay');\n" +
      "  var overlayParent = overlay ? overlay.parentElement : null;\n" +
      "  var focusRingCandidates = Array.from(document.querySelectorAll('[class*=\"FocusRing\"], [class*=\"focusring\"], [class*=\"focus-ring\"]')).slice(0, 5).map(el => { var cs=getComputedStyle(el); return { cls: (el.className||'').toString().slice(0,60), zIndex: cs.zIndex, position: cs.position }; });\n" +
      "  return JSON.stringify({ bodyKids, overlayParent: overlayParent ? { tag: overlayParent.tagName, id: overlayParent.id } : null, focusRingCandidates });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) { console.log(r && r.result && r.result.value); c.close(); });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
