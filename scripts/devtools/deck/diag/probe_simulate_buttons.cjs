#!/usr/bin/env node
'use strict';
// Manually fire RegisterForControllerInputMessages callbacks by
// poking them via Steam's bridge — exercises every consumer that
// subscribed (search overlay, side nav, sidecar dpad bridge, etc.)
// without needing a real controller.
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const SCENARIO = process.env.SCENARIO || 'l1r1';
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => { const msg = JSON.parse(data); if (msg.id === i) { client.removeListener('message', h); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  const SCENARIO = ${JSON.stringify(SCENARIO)};
  // Snapshot the registered controller-input callbacks. They live as
  // anonymous functions inside Steam's internal registration list. We
  // can't directly call them without poking the bridge state, so
  // instead we synthesise the events by calling each subscriber that
  // was attached via window.__ds_input_bus when our bridge is loaded.
  // Fallback: dispatch synthetic CustomEvent on window so any DOM-
  // hooked path sees the simulation.
  const out = { scenario: SCENARIO, fired: 0, observers: 0, before: null, after: null };
  const snapshot = () => ({
    overlayOpen: !!document.querySelector('.ds-search-overlay'),
    sidenavOpen: !!document.querySelector('.ds-sidenav-overlay'),
    gpfocus: document.querySelector('.gpfocus')?.getAttribute('data-appid') || null,
    gpfocusIdx: document.querySelector('.gpfocus')?.getAttribute('data-ds-card-index') || null,
  });
  out.before = snapshot();
  // Walk the Steam-internal registration list (no public access; use a
  // private symbol probe). If that doesn't work, emit the synthetic
  // event the bridge dispatches.
  const fire = (button, pressed) => {
    // Direct path: call any subscriber registered through our internal
    // bus (controllerInput.ts pushes its listener to window.__ds_bus
    // when installed). If that bus isn't there, the user's build is
    // pre-bus and we can only hope DOM keydown fallbacks fire.
    const bus = window.__ds_input_bus;
    if (Array.isArray(bus)) {
      for (const cb of bus) { try { cb({ slot: 0, button, pressed }); out.fired++; } catch {} }
    }
  };
  if (SCENARIO === 'l1r1') {
    fire(4, true); fire(5, true);
    setTimeout(() => { fire(4, false); fire(5, false); }, 50);
  } else if (SCENARIO === 'dpadleft') {
    fire(22, true); setTimeout(() => fire(22, false), 30);
  } else if (SCENARIO === 'y') {
    fire(3, true); setTimeout(() => fire(3, false), 30);
  }
  return new Promise((resolve) => setTimeout(() => { out.after = snapshot(); resolve(JSON.stringify(out)); }, 700));
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    process.stdout.write(r.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
