#!/usr/bin/env node
// Get OnNavigationEvent through getter, and test onMoveLeft/onMoveRight behavior
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
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);

  var results = {};

  // 1. Get the getter function source
  var desc = Object.getOwnPropertyDescriptor(proto, 'OnNavigationEvent');
  if (desc && desc.get) {
    results.getterSrc = desc.get.toString().substring(0, 1500);
  }

  // 2. Try to find the original unbound function by examining prototype properties
  var names = Object.getOwnPropertyNames(proto);
  var navRelated = [];
  for (var name of names) {
    var d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && d.value && typeof d.value === 'function') {
      var src = d.value.toString();
      if (src.indexOf('Navigation') >= 0 || src.indexOf('onMove') >= 0 || 
          src.indexOf('m_rgNavigationHandlers') >= 0 || src.indexOf('vgp_ondirection') >= 0 ||
          src.indexOf('detail.button') >= 0 || src.indexOf('stopPropagation') >= 0) {
        navRelated.push({ name: name, src: src.substring(0, 500) });
      }
    }
  }
  results.navRelatedMethods = navRelated;

  // 3. Search for the OnNavigationEvent body in the page's script
  // Check all script elements for BTryInternalNavigation to find the class definition
  var bpWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var bpDoc = bpWin ? bpWin.document : document;
  
  // Search in SharedJS's own function sources
  // The OnNavigationEvent body likely contains: BTryInternalNavigation, onMoveLeft, stopPropagation
  // Let me search for it via the getter's closure
  
  // 4. Get the full BTryInternalNavigation original source by un-patching temporarily
  if (proto.__ds_edge_patched__) {
    // The current BTryInternalNavigation is our wrapper. Let's get the full body to see orig
    results.currentBTryNav = proto.BTryInternalNavigation.toString().substring(0, 500);
  }

  // 5. Search for OnNavigationEvent pattern in all functions accessible from root
  // Try accessing module cache
  var moduleKeys = Object.keys(window.webpackChunksteamui || {}).slice(0, 3);
  results.webpackChunkKeys = moduleKeys;

  // 6. Alternative: examine the handler that d.u8 registered
  // d.u8 returns a cleanup function. The handler was this.OnNavigationEvent (bound).
  // We can examine what the bound function wraps by checking __proto__
  
  // 7. Find the class constructor to see if OnNavigationEvent is defined there
  var constructorSrc = proto.constructor ? proto.constructor.toString().substring(0, 2000) : null;
  results.constructorSrc = constructorSrc;

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
