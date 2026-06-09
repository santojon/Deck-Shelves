'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '192.168.1.15';
const PORT = process.env.DECK_CDP_PORT || '8081';
const c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1; const pending = new Map();
function send(method, params) {
  return new Promise((res) => { const i = id++; pending.set(i, res); c.send(JSON.stringify({ id: i, method, params: params || {} })); });
}
c.on('message', (d) => {
  const m = JSON.parse(d);
  if (typeof m.id !== 'number') return;
  const r = pending.get(m.id); if (!r) return;
  pending.delete(m.id); r(m.result || m.error);
});
c.on('open', async () => {
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(function(){
      const out = {};
      const root = document.getElementById('deck-shelves-home-root');
      if (!root) return { error: 'no ds root' };
      out.shelves = root.querySelectorAll('.ds-shelf').length;
      out.cards = root.querySelectorAll('.ds-card').length;

      // Item 11: friends-playing shelf state
      try {
        const all = window.__DECK_SHELVES_SHARED_SETTINGS__?.smartShelves || [];
        const fp = all.find(s => s.source?.mode === 'friends_playing');
        out.friendsShelf = fp ? { id: fp.id, title: fp.title, mode: fp.source.mode, enabled: fp.enabled, hidden: fp.hidden } : null;
        if (fp) {
          const shelfDiv = root.querySelector('.ds-shelf[data-shelf-id="' + fp.id + '"]');
          if (shelfDiv) {
            const cardsInShelf = shelfDiv.querySelectorAll('.ds-card[data-appid]');
            out.friendsShelfRendered = {
              cardCount: cardsInShelf.length,
              sampleCards: Array.from(cardsInShelf).slice(0, 6).map(c => ({
                appid: c.getAttribute('data-appid'),
                name: (c.querySelector('.ds-card-label-name')?.textContent || '').trim().substring(0, 40),
                hasImg: !!c.querySelector('img[src]'),
                imgSrc: (c.querySelector('img[src]')?.src || '').substring(0, 80),
              })),
            };
          } else {
            out.friendsShelfRendered = 'no DOM shelf for id ' + fp.id;
          }
        }
      } catch(e) { out.error11 = String(e); }

      // Item 13: focus ring state
      try {
        const focused = root.querySelector('.ds-card.gpfocus, .ds-card:focus');
        if (focused) {
          const cs = getComputedStyle(focused);
          out.focusedCardCss = {
            boxShadow: cs.boxShadow.substring(0, 150),
            zIndex: cs.zIndex,
            transform: cs.transform.substring(0, 60),
            outline: cs.outline.substring(0, 60),
          };
        } else {
          out.focusedCardCss = 'no focused card';
        }
      } catch(e) { out.error13 = String(e); }

      // Hero image presence per-shelf
      try {
        const heroShelves = root.querySelectorAll('.ds-shelf[data-ds-hero-enabled="true"]');
        out.heroEnabledShelves = heroShelves.length;
        out.heroImgs = Array.from(heroShelves).slice(0, 4).map(s => {
          const img = s.querySelector('[data-ds-per-shelf-hero="true"] img');
          return img ? { src: img.src.substring(0, 80), loaded: img.complete, w: img.naturalWidth } : 'no-img';
        });
      } catch(e) { out.errorHero = String(e); }

      return out;
    })()`,
  });
  console.log(JSON.stringify(r?.result?.value || r, null, 2));
  c.close();
});
