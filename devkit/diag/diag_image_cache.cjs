#!/usr/bin/env node
// Probe DS image cache state: enumerate the Cache Storage `ds-images-v1`
// bucket and report how many entries it currently holds + a small sample
// of URLs. Confirms whether the persistent cache is actually populating
// after a session, since the symptom of "every reboot re-downloads
// everything" can only be explained by an empty Cache Storage.
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stderr.write('Usage: diag_image_cache.cjs <target-id>\n'); process.exit(2); }

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
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

client.on('open', function() {
  send('Runtime.enable', {}, function() {
    var expr = "(async () => {\n" +
      "  if (typeof caches === 'undefined') return JSON.stringify({ supported: false });\n" +
      "  try {\n" +
      "    const names = await caches.keys();\n" +
      "    const c = await caches.open('ds-images-v1');\n" +
      "    const reqs = await c.keys();\n" +
      "    const urls = reqs.map(r => r.url);\n" +
      "    const heroes = urls.filter(u => /library_hero|header\\.jpg/.test(u));\n" +
      "    const portraits = urls.filter(u => /library_600x900|library_capsule/.test(u));\n" +
      "    const other = urls.length - heroes.length - portraits.length;\n" +
      "    return JSON.stringify({ supported: true, cacheNames: names, total: urls.length, heroes: heroes.length, portraits: portraits.length, other, heroSample: heroes.slice(0, 3) });\n" +
      "  } catch (e) { return JSON.stringify({ error: String(e) }); }\n" +
      "})()";
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, function(err, res) {
      if (err) { process.stderr.write('eval failed: ' + err.message + '\n'); process.exit(2); }
      try {
        var v = res && res.result && res.result.value;
        process.stdout.write(v + '\n');
      } catch (e) { process.stdout.write(JSON.stringify(res) + '\n'); }
      client.close();
    });
  });
});
client.on('error', function(e) { process.stderr.write('CDP error: ' + e.message + '\n'); process.exit(2); });
