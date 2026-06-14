#!/usr/bin/env node
'use strict';
// Probes ALL the input-related state in both BP and SharedJSContext.
// Use to verify whether keystrokes / button presses are being captured.
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (d) => { const m = JSON.parse(d); if (m.id === i) { c.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    c.on('message', h);
    c.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `JSON.stringify({
  bp: {
    keydownInstalled: window.__ds_bp_keydown_installed,
    keydownLogLen: Array.isArray(window.__ds_bp_keydown_log) ? window.__ds_bp_keydown_log.length : null,
    keydownLog: Array.isArray(window.__ds_bp_keydown_log) ? window.__ds_bp_keydown_log.slice(-15) : null,
    keydownErr: window.__ds_bp_keydown_err,
    inputInstalled: window.__ds_bp_input_installed,
    inputLogLen: Array.isArray(window.__ds_bp_input_log) ? window.__ds_bp_input_log.length : null,
    inputLog: Array.isArray(window.__ds_bp_input_log) ? window.__ds_bp_input_log.slice(-15) : null,
  },
  sjc: {
    homeKeyLast: window.__ds_home_key_last,
    homeBtnLast: window.__ds_home_btn_last,
    sidenavBtnLog: Array.isArray(window.__ds_sidenav_btn_log) ? window.__ds_sidenav_btn_log : null,
    sidenavFirstCard: window.__ds_sidenav_first_card,
    searchMounted: window.__ds_search_mounted,
    sidenavMounted: window.__ds_sidenav_mounted,
    searchEnabled: window.__ds_search_enabled,
    sidenavEnabled: window.__ds_sidenav_enabled,
  },
})`;
(async () => {
  await new Promise(r => c.once('open', r));
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r.result.value);
  c.close();
})();
