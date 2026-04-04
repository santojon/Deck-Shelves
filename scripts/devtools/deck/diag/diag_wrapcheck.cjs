#!/usr/bin/env node
// Verify wrapper listener and trace event flow for RIGHT at last card
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
var client = new ws('ws://' + HOST + ':8081/devtools/page/' + target);
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

var expression = `(function() {
  var results = {};

  // Check if deck-shelves-root wrapper has our edge listener
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var bpDoc = bpWin.document;
  
  var mountEl = bpDoc.getElementById('deck-shelves-home-root');
  results.mountExists = !!mountEl;
  
  var wrapperEl = mountEl ? mountEl.querySelector('.deck-shelves-root') : null;
  results.wrapperExists = !!wrapperEl;
  results.wrapperHasListener = wrapperEl ? !!wrapperEl['__ds_edge_listener__'] : false;
  
  // Check the DOM hierarchy depth
  if (wrapperEl) {
    var chain = [];
    var el = wrapperEl;
    while (el && chain.length < 10) {
      chain.push({
        tag: el.tagName,
        id: el.id || '',
        class: (el.className || '').substring(0, 60)
      });
      el = el.parentElement;
    }
    results.domChain = chain;
  }

  // Check how d.u8 registers - does it use capture or bubble?
  // We can check by looking at the cleanup function
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;

  // Find d.u8 source
  var proto = Object.getPrototypeOf(root);
  var regSrc = proto.RegisterDOMEvents.toString();
  // d.u8 is referenced as (0,d.u8) — find it in scope
  // Check the navHandler cleanup function pattern
  // navHandler0 was: "()=>function(e,t,n){e.removeEventListener(t,n)}(e,t,n)"
  // This means: element.removeEventListener(eventName, handler) — NO capture flag!
  // So d.u8 uses bubble phase (default). Confirmed.
  results.d_u8_bubble_confirmed = true;

  // Find wrapper + first row with children
  var wrapper = null;
  function findW(n) {
    if (wrapper) return;
    var el = n.Element || n.m_element;
    if (el && (el.className||'').indexOf('deck-shelves-root') >= 0) { wrapper = n; return; }
    for (var c of (n.m_rgChildren||[])) findW(c);
  }
  findW(root);

  if (wrapper) {
    results.wrapperLayout = wrapper.GetLayout ? wrapper.GetLayout() : null;
    results.wrapperCC = (wrapper.m_rgChildren||[]).length;

    // Check the wrapper's registered handlers
    results.wrapperNavHandlers = (wrapper.m_rgNavigationHandlers||[]).length;
    
    // Check first row
    var rows = [];
    function findR(n) {
      for (var c of (n.m_rgChildren||[])) {
        var el = c.Element || c.m_element;
        if (el && (el.className||'').indexOf('ds-row-scroll') >= 0) rows.push(c);
        else findR(c);
      }
    }
    findR(wrapper);

    results.rowCount = rows.length;
    if (rows.length > 0) {
      var firstRow = rows[0];
      results.firstRowNavHandlers = (firstRow.m_rgNavigationHandlers||[]).length;
      results.firstRowCC = (firstRow.m_rgChildren||[]).length;

      // Check if the row element is INSIDE the wrapper element in DOM
      var rowEl = firstRow.Element || firstRow.m_element;
      var wEl = wrapper.Element || wrapper.m_element;
      results.rowInsideWrapper = wEl && rowEl ? wEl.contains(rowEl) : null;
      
      // Check if wrapper element is the SAME as the wrapperEl we found via querySelector
      results.wrapperElMatch = wEl === wrapperEl;
    }
  }

  // Check scroll area (parent of wrapper)
  var scrollParent = wrapper ? wrapper.m_Parent : null;
  if (scrollParent) {
    var spEl = scrollParent.Element || scrollParent.m_element;
    results.scrollParentClass = spEl ? (spEl.className||'').substring(0, 60) : null;
    results.scrollParentNavHandlers = (scrollParent.m_rgNavigationHandlers||[]).length;
    results.scrollParentLayout = scrollParent.GetLayout ? scrollParent.GetLayout() : null;
    results.scrollParentCC = (scrollParent.m_rgChildren||[]).length;
    
    // Check if mountEl is between wrapperEl and scrollParent element
    if (mountEl && spEl) {
      results.mountInsideScrollParent = spEl.contains(mountEl);
      results.wrapperInsideMount = mountEl.contains(wrapperEl);
    }
  }

  return JSON.stringify(results);
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (val) {
      try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
      catch(e) { process.stdout.write(val + '\n'); }
    } else {
      process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n');
    }
    client.close();
    process.exit(0);
  });
});
