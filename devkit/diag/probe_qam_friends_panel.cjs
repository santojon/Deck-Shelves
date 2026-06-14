// Inspect the Friends & Chat tab inside the QAM. Reports the
// `FriendsListAndChatsSteamDeck` container, the friends-list panel on
// the left, the `SteamDeckChats` conversation panel on the right
// (currently active or in `SteamDeckChatsHidden` state), and the CSS
// rules that drive the show/hide behaviour.
//
// Useful for studying how the native Friends & Chat "expansion"
// works — it does NOT resize the QAM window; instead it uses the full
// 803px tab content area for a side-by-side list + chats layout.
//
// Usage: node devkit/diag/probe_qam_friends_panel.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

runAndPrint('qam', `(function(){
  const out = {};

  // FriendsListAndChatsSteamDeck is the top-level container that hosts
  // both the friends list and the chats panel side-by-side.
  const root = document.querySelector('.FriendsListAndChatsSteamDeck');
  if (root) {
    const r = root.getBoundingClientRect();
    out.container = { class: root.className.substring(0, 120), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
  } else {
    return { error: 'FriendsListAndChatsSteamDeck not mounted — open the Friends & Chat tab in QAM first' };
  }

  const list = document.querySelector('.FriendsListSteamDeckTopSection')?.parentElement
    ?? document.querySelector('.FriendsListSteamDeckTabs')?.parentElement;
  if (list) {
    const r = list.getBoundingClientRect();
    out.friendsList = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
  }

  const chats = document.querySelector('.SteamDeckChats');
  if (chats) {
    const cs = getComputedStyle(chats);
    const r = chats.getBoundingClientRect();
    out.chats = {
      class: chats.className.substring(0, 120),
      hidden: chats.classList.contains('SteamDeckChatsHidden'),
      w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x),
      display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
      flex: cs.flex,
    };
  }

  // The Friends & Chat layout rules — useful to verify the "expansion"
  // is implemented as flex-driven layout, not as a window-resize call.
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of (sheet.cssRules || [])) {
        const sel = rule.selectorText || '';
        if (sel.startsWith('.FriendsListAndChatsSteamDeck') || sel.startsWith('.SteamDeckChats')) {
          const css = (rule.cssText || '').substring(0, 240);
          if (css.includes('width') || css.includes('flex') || css.includes('display')) {
            rules.push({ sel: sel.substring(0, 140), css });
          }
        }
      }
    } catch {}
  }
  out.layoutRules = rules.slice(0, 12);

  return out;
})()`);
