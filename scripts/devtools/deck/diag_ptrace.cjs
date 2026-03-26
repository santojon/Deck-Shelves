#!/usr/bin/env node
// Install persistent trace, then poll for results
'use strict';

var ws = require('ws');
var target = process.argv[2];
var mode = process.argv[3] || 'install'; // 'install' or 'read'
if (!target) { process.stdout.write('Usage: node diag_ptrace.cjs <target> [install|read|clear]\n'); process.exit(1); }

var client = new ws('ws://192.168.1.15:8081/devtools/page/' + target);
var msgId = 1;

function send(method, params, cb) {
  var id = msgId++;
  var handler = function(data) {
    var msg = JSON.parse(data);
    if (msg.id === id) {
      client.removeListener('message', handler);
      cb(null, msg.result);
    }
  };
  client.on('message', handler);
  client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
}

var installExpr = `(function() {
  if (window.__dstrace_installed) return JSON.stringify({ already: true, traceLen: (window.__dstrace||[]).length });
  window.__dstrace_installed = true;
  window.__dstrace = [];
  var T = window.__dstrace;
  var DIR = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var bpDoc = bpWin.document;

  // Instrument at document level (capture + bubble) for LEFT/RIGHT only
  bpDoc.addEventListener('vgp_ondirection', function(evt) {
    var btn = evt.detail ? evt.detail.button : 0;
    if (btn !== 14 && btn !== 15) return;
    var tgt = evt.target;
    var cn = tgt ? (tgt.className||'').substring(0, 50) : '?';
    T.push('[DOC_CAP] ' + (DIR[btn]||btn) + ' target=' + cn);
  }, true);

  bpDoc.addEventListener('vgp_ondirection', function(evt) {
    var btn = evt.detail ? evt.detail.button : 0;
    if (btn !== 14 && btn !== 15) return;
    T.push('[DOC_BUB] ' + (DIR[btn]||btn) + ' ESCAPED_TO_DOC cancelBubble=' + evt.cancelBubble);
  }, false);

  // Instrument wrapper
  var mountEl = bpDoc.getElementById('deck-shelves-home-root');
  var wEl = mountEl ? mountEl.querySelector('.deck-shelves-root') : null;
  if (wEl) {
    wEl.addEventListener('vgp_ondirection', function(evt) {
      var btn = evt.detail ? evt.detail.button : 0;
      if (btn !== 14 && btn !== 15) return;
      T.push('[WRAP_BUB_EARLY] ' + (DIR[btn]||btn) + ' cancelBubble=' + evt.cancelBubble);
    }, false);
  }

  // Instrument the first ds-row-scroll inside wrapper  
  if (wEl) {
    var rowEls = wEl.querySelectorAll('.ds-row-scroll');
    for (var r = 0; r < rowEls.length; r++) {
      (function(rowEl, idx) {
        rowEl.addEventListener('vgp_ondirection', function(evt) {
          var btn = evt.detail ? evt.detail.button : 0;
          if (btn !== 14 && btn !== 15) return;
          T.push('[ROW' + idx + '_BUB] ' + (DIR[btn]||btn) + ' cancelBubble=' + evt.cancelBubble);
        }, false);
      })(rowEls[r], r);
    }
  }

  // Instrument scroll area parent
  if (mountEl) {
    var p = mountEl.parentElement;
    while (p && p !== bpDoc.body) {
      if ((p.className||'').includes('Panel') && (p.className||'').includes('Focusable')) {
        (function(el) {
          el.addEventListener('vgp_ondirection', function(evt) {
            var btn = evt.detail ? evt.detail.button : 0;
            if (btn !== 14 && btn !== 15) return;
            T.push('[ANCESTOR_BUB ' + (el.className||'').substring(0,30) + '] ' + (DIR[btn]||btn) + ' REACHED');
          }, false);
        })(p);
        break; // just the first ancestor Focusable
      }
      p = p.parentElement;
    }
  }

  return JSON.stringify({ installed: true });
})()`;

var readExpr = `JSON.stringify(window.__dstrace || [])`;
var clearExpr = `(function() { window.__dstrace = []; return 'cleared'; })()`;

client.on('open', function() {
  var expr;
  if (mode === 'install') expr = installExpr;
  else if (mode === 'read') expr = readExpr;
  else if (mode === 'clear') expr = clearExpr;
  
  send('Runtime.evaluate', { expression: expr, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (mode === 'read') {
      try {
        var arr = JSON.parse(val);
        for (var e of arr) process.stdout.write(e + '\n');
        process.stdout.write('\n(' + arr.length + ' entries)\n');
      } catch(e) { process.stdout.write((val||'null') + '\n'); }
    } else {
      try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
      catch(e) { process.stdout.write((val||'null') + '\n'); }
    }
    client.close();
    process.exit(0);
  });
});
