#!/usr/bin/env node
// Hero placeholder regression probe — walks every `.ds-per-shelf-hero-img`
// on the home page (BP target) and asserts the two invariants that 2.3.2
// landed:
//
//   1. Every loaded img (`naturalWidth > 0`) has the `is-loaded` class.
//   2. Every NOT-loaded img has computed `opacity: 0` AND no `is-loaded`
//      class — i.e. the load-gating CSS rule wins over any active theme.
//
// Either failure means the broken-image flash regressed (typically: a new
// theme shipped a higher-specificity opacity rule that beats
// `#deck-shelves-home-root .ds-per-shelf-hero-img`, or the React class
// toggle dropped the `is-loaded` modifier somewhere).
//
// Usage:  node diag_hero_load.cjs <bp-target-id>
// Or via the CLI:  python3 devkit/cli.py diag run hero_load
//
// Exit code: 0 if all imgs satisfy the invariants, 1 if any violation.
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_hero_load.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
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

// Evaluated in the BP context. Returns one JSON payload describing every
// hero img + whether it satisfies the load-gating contract.
var expression = `
(function () {
  var imgs = Array.from(document.querySelectorAll('.ds-per-shelf-hero-img'));
  if (!imgs.length) {
    return JSON.stringify({ ok: true, total: 0, violations: [], note: 'no hero imgs found (home not visible?)' });
  }
  var violations = [];
  imgs.forEach(function (img, i) {
    var natW = img.naturalWidth || 0;
    var natH = img.naturalHeight || 0;
    var hasIsLoaded = img.classList.contains('is-loaded');
    var op = parseFloat(window.getComputedStyle(img).opacity || '1');
    var src = (img.src || '').slice(0, 100);
    var loaded = natW > 0 && natH > 0;

    if (loaded && !hasIsLoaded) {
      violations.push({
        idx: i, kind: 'loaded-without-class',
        src: src, natW: natW, natH: natH, hasIsLoaded: hasIsLoaded, opacity: op,
        note: 'img decoded successfully but is missing the is-loaded class — React load state lost?'
      });
    }
    if (!loaded && hasIsLoaded) {
      violations.push({
        idx: i, kind: 'class-without-load',
        src: src, natW: natW, natH: natH, hasIsLoaded: hasIsLoaded, opacity: op,
        note: 'img has is-loaded class but naturalWidth/Height = 0 — stale class after slot src change?'
      });
    }
    if (!loaded && op > 0.01) {
      violations.push({
        idx: i, kind: 'opacity-leaks-while-loading',
        src: src, natW: natW, natH: natH, hasIsLoaded: hasIsLoaded, opacity: op,
        note: 'unloaded img has visible opacity — the #deck-shelves-home-root .ds-per-shelf-hero-img { opacity: 0 !important } rule lost specificity to a theme override; broken-image glyph will paint'
      });
    }
  });

  return JSON.stringify({
    ok: violations.length === 0,
    total: imgs.length,
    loadedCount: imgs.filter(function (i) { return (i.naturalWidth || 0) > 0; }).length,
    violations: violations,
  });
})()
`;

client.on('open', function () {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function (_e, r) {
    var payload;
    try {
      payload = JSON.parse(r.result.value);
    } catch (e) {
      process.stderr.write('Failed to parse probe payload: ' + String(e) + '\n');
      process.stderr.write(JSON.stringify(r) + '\n');
      client.close();
      process.exit(2);
    }

    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');

    if (payload.violations && payload.violations.length) {
      process.stderr.write('\n  ' + payload.violations.length + ' violation(s) — hero load-gating regressed.\n');
      process.stderr.write('  See the violation list above for the offending imgs.\n');
      client.close();
      process.exit(1);
    }
    client.close();
    process.exit(0);
  });
});

client.on('error', function (e) {
  process.stderr.write('CDP connection failed: ' + String(e) + '\n');
  process.exit(2);
});
