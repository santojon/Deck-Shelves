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
      "  try {\n" +
      "    var ds = document.getElementById('deck-shelves-home-root');\n" +
      "    var all = document.querySelectorAll('*');\n" +
      "    var n = all.length;\n" +
      "    var transitions = 0, transforms = 0, scales = 0, shadows = 0;\n" +
      "    var sampleTrans = [], sampleScale = [], sampleShadow = [];\n" +
      "    for (var i = 0; i < n; i++){\n" +
      "      var el = all[i];\n" +
      "      if (ds && ds.contains(el)) continue;\n" +
      "      var cs = getComputedStyle(el);\n" +
      "      var tr = cs.transition || '';\n" +
      "      var tf = cs.transform || '';\n" +
      "      var bs = cs.boxShadow || '';\n" +
      "      if (tr && tr !== 'all 0s ease 0s' && tr.indexOf('transform') !== -1) {\n" +
      "        transitions++;\n" +
      "        if (sampleTrans.length < 6) sampleTrans.push({ cls: (el.className||'').toString().split(' ').slice(0,2).join(' '), trans: tr });\n" +
      "      }\n" +
      "      if (tf !== 'none') transforms++;\n" +
      "      if (tf.indexOf('scale') !== -1) {\n" +
      "        scales++;\n" +
      "        if (sampleScale.length < 6) sampleScale.push({ cls: (el.className||'').toString().split(' ').slice(0,2).join(' '), tf: tf });\n" +
      "      } else if (tf !== 'none' && sampleScale.length < 6) {\n" +
      "        sampleScale.push({ cls: (el.className||'').toString().split(' ').slice(0,2).join(' '), tf: tf, kind: 'non-scale' });\n" +
      "      }\n" +
      "      if (bs && bs !== 'none' && bs.length < 250) {\n" +
      "        shadows++;\n" +
      "        if (sampleShadow.length < 6) sampleShadow.push({ cls: (el.className||'').toString().split(' ').slice(0,2).join(' '), bs: bs });\n" +
      "      }\n" +
      "    }\n" +
      "    return JSON.stringify({ totalEls: n, transitions, transforms, scales, shadows, sampleTrans, sampleScale, sampleShadow });\n" +
      "  } catch (e) {\n" +
      "    return JSON.stringify({ err: String(e) });\n" +
      "  }\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      if (e) { console.error('evaluate error:', e.message); c.close(); return; }
      console.log(r && r.result && (r.result.value || r.result.description || JSON.stringify(r.result)));
      c.close();
    });
  });
});
c.on('error', function(e){ console.error('ws err:', e.message); process.exit(2); });
