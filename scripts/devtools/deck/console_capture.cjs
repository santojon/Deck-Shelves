const W = require('ws');
const TARGET_ID = process.argv[2];
const WAIT_SEC = parseInt(process.argv[3] || '20');
const w = new W('ws://127.0.0.1:8081/devtools/page/' + TARGET_ID);
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
      
      if (args.includes('[DS]') || args.includes('ds-row-scroll') || args.includes('reparent') || args.includes('deck-shelves') || args.includes('Deck Shelves')) {
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
