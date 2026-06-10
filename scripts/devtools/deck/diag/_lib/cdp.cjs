// Shared CDP helper for node-based diag probes. Each probe imports this
// instead of re-implementing the ws boilerplate.
//
// Usage:
//   const { runProbe } = require('./_lib/cdp');
//   runProbe('targetId', `(function(){ /* page JS */ })()`)
//     .then(value => console.log(JSON.stringify(value, null, 2)));
//
// `target` accepts either the short prefix shown by `curl /json` or the
// full id; the helper auto-discovers via /json if the prefix is given.
'use strict';

const http = require('http');
const ws = require('ws');

const HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '192.168.1.15';
const PORT = process.env.DECK_CDP_PORT || '8081';

function fetchTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}/json`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function resolveTargetId(maybeId) {
  if (!maybeId) throw new Error('target id required');
  // Already a full 32-char id?
  if (/^[A-F0-9]{32}$/i.test(maybeId)) return maybeId;
  const targets = await fetchTargets();
  const exact = targets.find((t) => t.id === maybeId);
  if (exact) return exact.id;
  // Try title match (e.g. 'bp', 'qam', 'shared')
  const lower = maybeId.toLowerCase();
  const byTitle = targets.find((t) => {
    const title = (t.title || '').toLowerCase();
    if (lower === 'bp') return title.includes('big picture');
    if (lower === 'qam') return title.includes('quickaccess');
    if (lower === 'shared') return title.includes('sharedjs');
    if (lower === 'mainmenu') return title.includes('mainmenu');
    return title.includes(lower);
  });
  if (byTitle) return byTitle.id;
  // Prefix match on id
  const prefix = targets.find((t) => t.id && t.id.startsWith(maybeId));
  if (prefix) return prefix.id;
  throw new Error(`no target matches "${maybeId}"`);
}

function runProbe(maybeId, expression, opts = {}) {
  const awaitPromise = opts.awaitPromise === true;
  const returnByValue = opts.returnByValue !== false;
  return resolveTargetId(maybeId).then((id) => new Promise((resolve, reject) => {
    const c = new ws(`ws://${HOST}:${PORT}/devtools/page/${id}`);
    let msgId = 1;
    const pending = new Map();
    const send = (method, params) => new Promise((r) => { const i = msgId++; pending.set(i, r); c.send(JSON.stringify({ id: i, method, params: params || {} })); });
    c.on('message', (d) => {
      const m = JSON.parse(d);
      if (typeof m.id !== 'number') return;
      const r = pending.get(m.id);
      if (typeof r !== 'function') return;
      pending.delete(m.id);
      r(m.result || m.error);
    });
    c.on('error', reject);
    c.on('open', async () => {
      try {
        const r = await send('Runtime.evaluate', { expression, returnByValue, awaitPromise });
        resolve(r?.result?.value !== undefined ? r.result.value : r);
      } catch (e) { reject(e); }
      finally { try { c.close(); } catch {} }
    });
  }));
}

// Convenience for probes that print the result JSON-pretty and exit.
function runAndPrint(maybeId, expression, opts) {
  runProbe(maybeId, expression, opts)
    .then((v) => { console.log(JSON.stringify(v, null, 2)); process.exit(0); })
    .catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
}

// Open a persistent CDP session for sequences of calls (Input.dispatchKeyEvent
// driven, Runtime.evaluate, etc.). Returns { call, eval, close } so the
// caller chains operations without paying the websocket open/close cost
// every step.
async function openSession(maybeId) {
  const id = await resolveTargetId(maybeId);
  const c = new ws(`ws://${HOST}:${PORT}/devtools/page/${id}`);
  let msgId = 1;
  const pending = new Map();
  c.on('message', (d) => {
    const m = JSON.parse(d);
    if (typeof m.id !== 'number') return;
    const r = pending.get(m.id);
    if (!r) return;
    pending.delete(m.id);
    if (m.error) r.reject(m.error);
    else r.resolve(m.result);
  });
  await new Promise((res, rej) => { c.once('open', res); c.once('error', rej); });
  const call = (method, params) => new Promise((resolve, reject) => {
    const i = msgId++;
    pending.set(i, { resolve, reject });
    c.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evaluate = (expression, opts = {}) => call('Runtime.evaluate', {
    expression,
    returnByValue: opts.returnByValue !== false,
    awaitPromise: opts.awaitPromise === true,
  }).then((r) => r?.result?.value !== undefined ? r.result.value : r);
  // Send a keydown+keyup pair. `name` accepts ArrowUp/Down/Left/Right,
  // Enter, Escape, 'a'..'z'. Adds a small natural delay so the runtime
  // handler treats it as a real keystroke (no key-repeat).
  const dispatchKey = async (name, opts = {}) => {
    const KEYMAP = {
      ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
      Enter: 13, Escape: 27, Space: 32, Tab: 9, Backspace: 8,
    };
    const code = KEYMAP[name] ?? (name.length === 1 ? name.charCodeAt(0) : 0);
    const params = { key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await call('Input.dispatchKeyEvent', { ...params, type: 'keyDown' });
    if (opts.holdMs) await new Promise(r => setTimeout(r, opts.holdMs));
    await call('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
    if (opts.settleMs !== 0) await new Promise(r => setTimeout(r, opts.settleMs ?? 120));
  };
  const close = () => { try { c.close(); } catch {} };
  return { call, evaluate, dispatchKey, close, targetId: id };
}

module.exports = { runProbe, runAndPrint, openSession, fetchTargets, resolveTargetId, HOST, PORT };
