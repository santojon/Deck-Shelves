// Confirm the BadgeFocusOverlay mounted and inline badges are hidden
// on the focused card (no duplicate render).
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
      "  var inline = document.querySelectorAll('.ds-card-badge-host--inline').length;\n" +
      "  var overlay = document.querySelectorAll('.ds-card-badge-host--overlay').length;\n" +
      "  var portal  = document.querySelectorAll('.ds-card-badge-host--portal').length;\n" +
      "  var focused = document.querySelector('.ds-card.gpfocus, .ds-card:focus');\n" +
      "  var fb = focused ? focused.querySelector('.ds-card-badge-host--inline') : null;\n" +
      "  var fbVisible = fb ? (getComputedStyle(fb).visibility !== 'hidden') : null;\n" +
      "  return JSON.stringify({ inline, overlay, portal, focusedHasInline: !!fb, focusedInlineVisible: fbVisible });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
