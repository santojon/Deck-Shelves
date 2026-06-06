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
    // Probe: find native recents cards (NOT DS), find one that's
    // focused, dump its computed transition + transform + the parent
    // class chain so we can replicate.
    var expr = "(function(){\n" +
      "  function describe(el){ if(!el) return null; var cs=getComputedStyle(el); return { tag: el.tagName.toLowerCase(), cls: el.className, transition: cs.transition, transform: cs.transform, willChange: cs.willChange, zIndex: cs.zIndex, position: cs.position }; }\n" +
      "  // Walk native recents area (NOT inside DS root)\n" +
      "  var ds = document.getElementById('deck-shelves-home-root');\n" +
      "  // Find cards in main home outside DS\n" +
      "  var all = Array.from(document.querySelectorAll('a[href*=\"library/app/\"], [role=\"link\"], .Focusable')).filter(el => !(ds && ds.contains(el)));\n" +
      "  var focused = all.filter(el => el.classList.contains('gpfocus') || el.matches(':focus') || el.classList.contains('gpfocuswithin'));\n" +
      "  var sample = focused.slice(0, 5).map(el => { return { self: describe(el), parent: describe(el.parentElement), gparent: describe(el.parentElement && el.parentElement.parentElement), gpgparent: describe(el.parentElement && el.parentElement.parentElement && el.parentElement.parentElement.parentElement) }; });\n" +
      "  // Also list any card-like elements with non-default transition\n" +
      "  var withTrans = all.filter(el => { var cs=getComputedStyle(el); return cs.transition && cs.transition !== 'all 0s ease 0s' && cs.transition !== 'none'; }).slice(0, 8).map(describe);\n" +
      "  return JSON.stringify({ totalNative: all.length, focusedCount: focused.length, focusedSample: sample, withTransitionSample: withTrans });\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(e, r) {
      console.log(r && r.result && r.result.value);
      c.close();
    });
  });
});
c.on('error', function(e){ console.error(e.message); process.exit(2); });
