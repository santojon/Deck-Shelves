#!/usr/bin/env node
// Overlap-tag rendering perf audit — Phase A baseline.
//
// Enables CDP's Performance domain on the BP page, samples it for 5
// seconds while the user sits idle on the home, and reports CPU /
// JSHeap deltas + the top 10 sampled functions from a profile trace.
//
// Two runs are expected — once with hero ON, once with hero OFF — and
// the deltas between them isolate the cost of the per-shelf hero +
// per-card badge portal observers. The script doesn't toggle hero
// itself: it just dumps the metrics each invocation. The caller
// redirects stdout to wherever the report should live.
//
// Usage:  node diag_overlap_perf.cjs <bp-target-id>
// Or via the CLI:  python3 devkit/cli.py diag run overlap_perf
//
// Exit code: 0 on success, 2 on CDP error.
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_overlap_perf.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var SAMPLE_MS = parseInt(process.env.DECK_PERF_SAMPLE_MS || '5000', 10);
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

function send(method, params, cb) {
  var id = msgId++;
  var handler = function(data) {
    var msg = JSON.parse(data);
    if (msg.id === id) {
      client.removeListener('message', handler);
      if (msg.error) return cb(new Error(method + ': ' + msg.error.message));
      cb(null, msg.result);
    }
  };
  client.on('message', handler);
  client.send(JSON.stringify({ id: id, method: method, params: params || {} }));
}

function metricsToMap(metrics) {
  var out = {};
  if (!metrics || !Array.isArray(metrics)) return out;
  for (var i = 0; i < metrics.length; i++) out[metrics[i].name] = metrics[i].value;
  return out;
}

function diffMetrics(before, after) {
  var keys = ['Timestamp', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'Nodes', 'JSEventListeners'];
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (before[k] !== undefined && after[k] !== undefined) {
      out[k] = { before: before[k], after: after[k], delta: after[k] - before[k] };
    }
  }
  return out;
}

// Summarises a CPU profile by hot self-time. Matches devtools' "Bottom-Up"
// view: aggregates self time per function and surfaces the top 10.
function summariseProfile(profile) {
  if (!profile || !profile.nodes || !profile.samples) return [];
  var nodeById = {};
  for (var i = 0; i < profile.nodes.length; i++) nodeById[profile.nodes[i].id] = profile.nodes[i];
  var hits = {};
  // Each sample is the leaf node for that interval; timeDeltas[i] is the
  // delta in microseconds before sample i (timeDeltas[0] is from startTime).
  for (var s = 0; s < profile.samples.length; s++) {
    var nid = profile.samples[s];
    var dt = profile.timeDeltas && profile.timeDeltas[s] ? profile.timeDeltas[s] : 0;
    hits[nid] = (hits[nid] || 0) + dt;
  }
  var rows = [];
  for (var nidStr in hits) {
    if (!Object.prototype.hasOwnProperty.call(hits, nidStr)) continue;
    var n = nodeById[nidStr];
    if (!n) continue;
    var fn = n.callFrame || {};
    rows.push({
      fn: fn.functionName || '(anonymous)',
      url: (fn.url || '').slice(-60),
      line: fn.lineNumber,
      selfTimeUs: hits[nidStr],
    });
  }
  rows.sort(function (a, b) { return b.selfTimeUs - a.selfTimeUs; });
  return rows.slice(0, 10);
}

// Counts the observer/listener footprint inside the home root — gives us
// the "before vs after" reduction even without a profile trace. Runs in the
// BP page context; returns shape: { cards, scrollAncestorsTotal, ... }.
function buildFootprintExpression() {
  return [
    '(function () {',
    "  var root = document.getElementById('deck-shelves-home-root');",
    "  if (!root) return JSON.stringify({ note: 'home root not mounted' });",
    "  var cards = root.querySelectorAll('.ds-card');",
    "  var heroImgs = root.querySelectorAll('.ds-per-shelf-hero-img');",
    "  var heroShelves = root.querySelectorAll('[data-ds-hero-enabled=\"true\"]');",
    "  return JSON.stringify({",
    "    cards: cards.length,",
    "    heroImgs: heroImgs.length,",
    "    heroEnabledShelves: heroShelves.length,",
    "    nodes: root.getElementsByTagName('*').length,",
    "  });",
    '})()',
  ].join('\n');
}

client.on('open', function () {
  send('Performance.enable', {}, function (err) {
    if (err) { process.stderr.write('Performance.enable failed: ' + err.message + '\n'); process.exit(2); }
    send('Profiler.enable', {}, function (perr) {
      if (perr) { process.stderr.write('Profiler.enable failed: ' + perr.message + '\n'); process.exit(2); }
      send('Profiler.setSamplingInterval', { interval: 1000 }, function () {
        send('Runtime.evaluate', { expression: buildFootprintExpression(), returnByValue: true }, function (_e0, r0) {
          var footprint = null;
          try { footprint = JSON.parse(r0.result.value); } catch (_) { footprint = { note: 'footprint probe parse failed' }; }

          send('Performance.getMetrics', {}, function (_e1, r1) {
            var before = metricsToMap(r1 && r1.metrics);
            send('Profiler.start', {}, function (sErr) {
              if (sErr) { process.stderr.write('Profiler.start failed: ' + sErr.message + '\n'); process.exit(2); }
              setTimeout(function () {
                send('Profiler.stop', {}, function (_e2, r2) {
                  var top = summariseProfile(r2 && r2.profile);
                  send('Performance.getMetrics', {}, function (_e3, r3) {
                    var after = metricsToMap(r3 && r3.metrics);
                    var diffs = diffMetrics(before, after);
                    var report = {
                      sampleMs: SAMPLE_MS,
                      footprint: footprint,
                      metricsDelta: diffs,
                      hotSelfTimeUs: top,
                    };
                    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
                    client.close();
                    process.exit(0);
                  });
                });
              }, SAMPLE_MS);
            });
          });
        });
      });
    });
  });
});

client.on('error', function (e) {
  process.stderr.write('CDP connection failed: ' + String(e) + '\n');
  process.exit(2);
});
