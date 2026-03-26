#!/usr/bin/env node
// Install real-time tracing on all nav events in the shelves subtree
// Writes to console.warn so we can see everything
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

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
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var bpDoc = bpWin.document;
  var DIR = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
  window.__dstrace = [];
  var T = window.__dstrace;

  // Add capture-phase listener on the BP document to log ALL vgp_ondirection events
  bpDoc.addEventListener('vgp_ondirection', function(evt) {
    var btn = evt.detail ? evt.detail.button : '?';
    if (btn !== 14 && btn !== 15) return; // only LEFT/RIGHT
    var tgt = evt.target;
    var cn = tgt ? (tgt.className||'').substring(0, 50) : '?';
    T.push('DOC_CAPTURE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn) + ' target=' + cn);
  }, true);

  // Add bubble-phase listener on BP document to see if event reaches it
  bpDoc.addEventListener('vgp_ondirection', function(evt) {
    var btn = evt.detail ? evt.detail.button : '?';
    if (btn !== 14 && btn !== 15) return;
    T.push('DOC_BUBBLE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn) + ' ESCAPED!');
  }, false);

  // Add listeners at key points in the chain
  var mountEl = bpDoc.getElementById('deck-shelves-home-root');
  var wrapperEl = mountEl ? mountEl.querySelector('.deck-shelves-root') : null;

  // Wrapper capture
  if (wrapperEl) {
    wrapperEl.addEventListener('vgp_ondirection', function(evt) {
      var btn = evt.detail ? evt.detail.button : '?';
      if (btn !== 14 && btn !== 15) return;
      T.push('WRAPPER_CAPTURE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn));
    }, true);
    wrapperEl.addEventListener('vgp_ondirection', function(evt) {
      var btn = evt.detail ? evt.detail.button : '?';
      if (btn !== 14 && btn !== 15) return;
      T.push('WRAPPER_BUBBLE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn) + ' propagStopped=' + evt.cancelBubble);
    }, false);
  }

  // Mount element
  if (mountEl) {
    mountEl.addEventListener('vgp_ondirection', function(evt) {
      var btn = evt.detail ? evt.detail.button : '?';
      if (btn !== 14 && btn !== 15) return;
      T.push('MOUNT_BUBBLE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn));
    }, false);
  }

  // Scroll area (parent of mount)
  if (mountEl && mountEl.parentElement) {
    var scrollEl = mountEl.parentElement;
    // Go up to find the scroll area Panel Focusable
    while (scrollEl && !(scrollEl.className||'').includes('_3PhGYbM')) {
      scrollEl = scrollEl.parentElement;
    }
    if (scrollEl) {
      scrollEl.addEventListener('vgp_ondirection', function(evt) {
        var btn = evt.detail ? evt.detail.button : '?';
        if (btn !== 14 && btn !== 15) return;
        T.push('SCROLL_BUBBLE phase=' + evt.eventPhase + ' btn=' + (DIR[btn]||btn) + ' REACHED_SCROLL_AREA!');
      }, false);
    }
  }

  return JSON.stringify({ installed: true, wrapperEl: !!wrapperEl, mountEl: !!mountEl });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: installExpr, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    process.stdout.write('=== INSTALLED ===\n');
    try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
    catch(e) { process.stdout.write((val||'null') + '\n'); }

    process.stdout.write('\nWaiting 20s — navigate to last card of first shelf, press RIGHT\n');

    setTimeout(function() {
      send('Runtime.evaluate', { expression: 'JSON.stringify(window.__dstrace || [])', returnByValue: true }, function(err2, res2) {
        var val2 = res2 && res2.result && res2.result.value;
        process.stdout.write('\n=== TRACE ===\n');
        try {
          var arr = JSON.parse(val2);
          for (var e of arr) process.stdout.write(e + '\n');
          process.stdout.write('\n(' + arr.length + ' entries)\n');
        } catch(e) { process.stdout.write((val2||'null') + '\n'); }
        client.close();
        process.exit(0);
      });
    }, 20000);
  });
});
