const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);
let msgId = 0;

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        w.removeListener('message', handler);
        const r = msg.result?.result;
        const exc = msg.result?.exceptionDetails;
        if (exc) resolve({ exception: exc.text || exc.exception?.description });
        else if (r?.value) { try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); } }
        else resolve(r);
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    const result = await evaluate(`JSON.stringify((function(){
      var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
      var doc = win.document;
      var mount = doc.getElementById('deck-shelves-home-root');
      if (!mount) return { error: 'no mount found' };
      var cards = Array.from(mount.querySelectorAll('.ds-card'));
      var focusedCards = cards.filter(function(c) { return c.classList.contains('ds-focused'); });
      var results = { cardCount: cards.length, focusedCount: focusedCards.length, cards: [] };
      var sample = focusedCards.length > 0 ? focusedCards : cards.slice(0, 3);
      sample.forEach(function(card) {
        var art = card.querySelector('.ds-card-art');
        if (!art) return;
        var cs = win.getComputedStyle(art);
        var cardCs = win.getComputedStyle(card);
        results.cards.push({
          appid: card.getAttribute('data-appid'),
          focused: card.classList.contains('ds-focused'),
          card: {
            overflow: cardCs.overflow,
            boxShadow: cardCs.boxShadow,
            outline: cardCs.outline,
            border: cardCs.border
          },
          art: {
            overflow: cs.overflow,
            boxShadow: cs.boxShadow,
            outline: cs.outline,
            outlineOffset: cs.outlineOffset,
            borderRadius: cs.borderRadius,
            transform: cs.transform,
            filter: cs.filter,
            position: cs.position,
            zIndex: cs.zIndex
          }
        });
      });
      return results;
    })())`);

    console.log(JSON.stringify(result, null, 2));

  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 15000);
