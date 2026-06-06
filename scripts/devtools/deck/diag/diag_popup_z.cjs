var ws = require('ws');
var c = new ws('ws://192.168.1.15:8081/devtools/page/' + process.argv[2]);
var id = 0;
function send(m, p, cb) { var i=++id; c.on('message', function h(d){var x=JSON.parse(d);if(x.id===i){c.removeListener('message',h);cb(x.error,x.result);}}); c.send(JSON.stringify({id:i,method:m,params:p||{}})); }
c.on('open', function() {
  send('Runtime.enable', {}, function() {
    var expr = "(function(){\n" +
      "  var pop = document.getElementById('popup_target');\n" +
      "  if (!pop) return JSON.stringify({nope:true});\n" +
      "  var cs = getComputedStyle(pop);\n" +
      "  return JSON.stringify({ transform: cs.transform, filter: cs.filter, willChange: cs.willChange, isolation: cs.isolation, mixBlendMode: cs.mixBlendMode, contain: cs.contain, perspective: cs.perspective, position: cs.position, zIndex: cs.zIndex });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) { console.log(r && r.result && r.result.value); c.close(); });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
