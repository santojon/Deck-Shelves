var ws = require('ws');
var target = process.argv[2];
var c = new ws('ws://192.168.1.15:8081/devtools/page/' + target, { maxPayload: 50 * 1024 * 1024 });
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
      "  // Find ANY native element with non-trivial transform OR transition (non-zero duration)\n" +
      "  var all = Array.from(document.querySelectorAll('*')).filter(el => !(ds && ds.contains(el)));\n" +
      "  var withTransform = [];\n" +
      "  var withTrans = [];\n" +
      "  var withScale = [];\n" +
      "  var withShadow = [];\n" +
      "  for (var i=0; i<all.length; i++){\n" +
      "    var el = all[i];\n" +
      "    var cs = getComputedStyle(el);\n" +
      "    if (cs.transform !== 'none') withTransform.push({ cls: el.className.split(' ').slice(0,2).join(' '), tr: cs.transform });\n" +
      "    if (cs.transition && cs.transition !== 'all 0s ease 0s' && cs.transition !== 'none' && !cs.transition.startsWith('opacity 0s')) withTrans.push({ cls: el.className.split(' ').slice(0,2).join(' '), tag: el.tagName.toLowerCase(), trans: cs.transition });\n" +
      "    if (cs.transform && cs.transform.indexOf('scale') >= 0) withScale.push({ cls: el.className.split(' ').slice(0,2).join(' '), tr: cs.transform });\n" +
      "    if (cs.boxShadow && cs.boxShadow !== 'none' && cs.boxShadow.length < 200) withShadow.push({ cls: el.className.split(' ').slice(0,2).join(' '), bs: cs.boxShadow });\n" +
      "  }\n" +
      "  return JSON.stringify({\n" +
      "    totalEls: all.length,\n" +
      "    transformCount: withTransform.length,\n" +
      "    transformSample: withTransform.slice(0, 8),\n" +
      "    transitionCount: withTrans.length,\n" +
      "    transitionSample: withTrans.slice(0, 8),\n" +
      "    scaleCount: withScale.length,\n" +
      "    scaleSample: withScale.slice(0, 8),\n" +
      "    shadowCount: withShadow.length,\n" +
      "    shadowSample: withShadow.slice(0, 8)\n" +
      "  });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
