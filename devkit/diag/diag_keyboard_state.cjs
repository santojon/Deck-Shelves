// Steam Deck on-screen keyboard inspector. Use this when "Steam+X
// doesn't open the keyboard" or "the keyboard sticks around after
// closing the search". Reads:
//   * what's currently `document.activeElement` in BP — Steam+X gates
//     the auto-popup on this being an actual <input>
//   * the search pill input attrs (type, tabIndex, inputmode, etc.)
//     — Steam Deck's keyboard popup is class- + attr-sensitive
//   * the last focus retry snapshot the SearchOverlay wrote
//     (`__ds_search_active = { isInput, activeTag, type, tabIndex, kb }`)
//   * which keyboard APIs the SteamClient.Input surface exposes — we
//     only have Dismissed-notifications, no programmatic Open
//
// Usage:
//   node devkit/diag/diag_keyboard_state.cjs
'use strict';

const { runProbe } = require('./_lib/cdp.cjs');

const expr = `(() => {
  const g = globalThis;
  const view = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
  const doc = view?.document;
  const out = {
    search_active: g.__ds_search_active,
    pill_exists: false,
  };
  if (!doc) { out.err = 'no BP doc'; return out; }
  const active = doc.activeElement;
  out.activeTag = active?.tagName;
  out.activeIsInput = active?.tagName === 'INPUT';
  out.activeClass = typeof active?.className === 'string' ? active.className.slice(0, 200) : null;
  const pill = doc.querySelector('.ds-search-pill-host');
  out.pill_exists = !!pill;
  if (pill) {
    const inp = pill.querySelector('input');
    if (inp) {
      out.pillInput = {
        type: inp.type,
        tabIndex: inp.tabIndex,
        isActive: inp === doc.activeElement,
        inputmode: inp.getAttribute('inputmode'),
        autocomplete: inp.getAttribute('autocomplete'),
        autocapitalize: inp.getAttribute('autocapitalize'),
        spellcheck: inp.getAttribute('spellcheck'),
        enterkeyhint: inp.getAttribute('enterkeyhint'),
      };
    }
  }
  const Input = view?.SteamClient?.Input ?? view?.opener?.SteamClient?.Input;
  if (Input) {
    out.kb_apis = Object.keys(Input).filter(k => /Keyboard|Virtual/i.test(k));
  }
  return out;
})()`;

runProbe('shared', expr)
  .then((v) => { console.log(JSON.stringify(v, null, 2)); process.exit(0); })
  .catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
