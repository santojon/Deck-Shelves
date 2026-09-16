#!/usr/bin/env node
// Boot-freeze probe — samples script + task duration for 5 s and
// reports the top JS frames so we can see what's keeping the UI busy
// after a reboot or plugin reload.
//
// Usage:  node diag_boot_freeze.cjs <bp-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stderr.write('Usage: diag_boot_freeze.cjs <target-id>\n'); process.exit(2); }

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var SAMPLE_MS = parseInt(process.env.DECK_BOOT_SAMPLE_MS || '5000', 10);
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

function send(method, params, cb) {
  var id = msgId++;
  function handler(data) {
    var msg = JSON.parse(data);
    if (msg.id === id) {
      client.removeListener('message', handler);
      if (msg.error) return cb(new Error(method + ': ' + msg.error.message));
      cb(null, msg.result);
    }
  }
  client.on('message', handler);
  client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
}

function metricsMap(m) { var o = {}; if (!m) return o; for (var i = 0; i < m.length; i++) o[m[i].name] = m[i].value; return o; }

client.on('open', function() {
  send('Performance.enable', {}, function() {
    send('Profiler.enable', {}, function() {
      send('Performance.getMetrics', {}, function(_e, m1) {
        send('Profiler.start', {}, function() {
          send('Profiler.setSamplingInterval', { interval: 250 }, function() {
            setTimeout(function() {
              send('Performance.getMetrics', {}, function(_e2, m2) {
                send('Profiler.stop', {}, function(_e3, prof) {
                  var before = metricsMap(m1.metrics);
                  var after = metricsMap(m2.metrics);
                  var report = {
                    sampleMs: SAMPLE_MS,
                    scriptMs: ((after.ScriptDuration - before.ScriptDuration) * 1000).toFixed(1),
                    taskMs: ((after.TaskDuration - before.TaskDuration) * 1000).toFixed(1),
                    layoutMs: ((after.LayoutDuration - before.LayoutDuration) * 1000).toFixed(1),
                    styleMs: ((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000).toFixed(1),
                    heapBefore: before.JSHeapUsedSize,
                    heapAfter: after.JSHeapUsedSize,
                    nodes: after.Nodes,
                    listeners: after.JSEventListeners,
                  };
                  // Top frames by hit count.
                  var nodes = (prof && prof.profile && prof.profile.nodes) || [];
                  var samples = (prof && prof.profile && prof.profile.samples) || [];
                  var counts = {};
                  for (var s = 0; s < samples.length; s++) counts[samples[s]] = (counts[samples[s]] || 0) + 1;
                  var nodeById = {};
                  for (var n = 0; n < nodes.length; n++) nodeById[nodes[n].id] = nodes[n];
                  var top = [];
                  for (var id in counts) {
                    var node = nodeById[id];
                    if (!node) continue;
                    var cf = node.callFrame || {};
                    var url = (cf.url || '').split('/').pop();
                    top.push({
                      n: counts[id],
                      fn: cf.functionName || '(anonymous)',
                      url: url,
                      line: cf.lineNumber,
                    });
                  }
                  top.sort(function(a, b) { return b.n - a.n; });
                  report.topFrames = top.slice(0, 20);
                  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
                  client.close();
                });
              });
            }, SAMPLE_MS);
          });
        });
      });
    });
  });
});
client.on('error', function(e) { process.stderr.write('CDP error: ' + e.message + '\n'); process.exit(2); });
