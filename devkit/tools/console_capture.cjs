const W = require('ws');
const SEL = (() => { try { return require('../lib/selectors.cjs'); } catch { return {}; } })();
const TARGET_ID = process.argv[2];
const WAIT_SEC = parseInt(process.argv[3] || '20');
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PROJECT_LABEL = SEL.PROJECT_LABEL || 'deck-shelves';
const ROW_SEL_BARE = (SEL.ROW_SEL || '.ds-row-scroll').replace(/^\./, '');
// Override the inline filter list by exporting DEVKIT_CONSOLE_FILTER as
// a comma-separated set of substrings. Defaults match Deck Shelves's
// usual log lines.
const FILTER = (process.env.DEVKIT_CONSOLE_FILTER || `[DS],${ROW_SEL_BARE},reparent,${PROJECT_LABEL}`)
  .split(',').map(s => s.trim()).filter(Boolean);
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);
let msgId = 0;

w.on('open', () => {
  // Enable Runtime to get console messages
  w.send(JSON.stringify({ id: ++msgId, method: 'Runtime.enable', params: {} }));
  
  console.log('Connected, listening for [DS] console messages for', WAIT_SEC, 'seconds...');
  
  w.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params?.args || []).map(a => {
        if (a.value !== undefined) return String(a.value);
        if (a.description) return a.description;
        return a.type || '?';
      }).join(' ');
      
      if (FILTER.some((needle) => args.includes(needle))) {
        const type = msg.params?.type || 'log';
        console.log(`[${type}] ${args}`);
      }
    }
  });
  
  setTimeout(() => {
    console.log('--- Done listening ---');
    w.close();
    process.exit(0);
  }, WAIT_SEC * 1000);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
