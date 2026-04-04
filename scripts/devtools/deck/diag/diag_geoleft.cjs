#!/usr/bin/env node
// Deep diagnostic: test FindNextFocusableChildGeometric for LEFT at first card
// Also install persistent logging into console.warn
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: node diag_geoleft.cjs <target>\n'); process.exit(1); }

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
  if (!main) return JSON.stringify({ error: 'no main tree' });
  var root = main.Root || main.m_Root || main;
  var proto = Object.getPrototypeOf(root);

  // Find deck-shelves-root
  var wrapperNode = null;
  function findWrapper(node) {
    if (wrapperNode) return;
    var el = node.Element || node.m_element || node.m_Element;
    if (el && typeof el.className === 'string' && el.className.indexOf('deck-shelves-root') >= 0) {
      wrapperNode = node;
      return;
    }
    var ch = node.m_rgChildren || [];
    for (var i = 0; i < ch.length; i++) findWrapper(ch[i]);
  }
  findWrapper(root);
  if (!wrapperNode) return JSON.stringify({ error: 'no wrapper' });

  // Find first ds-row-scroll
  var firstRow = null;
  function findRow(node) {
    if (firstRow) return;
    var ch = node.m_rgChildren || [];
    for (var i = 0; i < ch.length; i++) {
      var el = ch[i].Element || ch[i].m_element || ch[i].m_Element;
      if (el && typeof el.className === 'string' && el.className.indexOf('ds-row-scroll') >= 0) {
        firstRow = ch[i];
        return;
      }
      findRow(ch[i]);
    }
  }
  findRow(wrapperNode);
  if (!firstRow) return JSON.stringify({ error: 'no row' });

  var results = {};
  var kids = firstRow.m_rgChildren || [];
  results.childCount = kids.length;
  results.layout = firstRow.GetLayout ? firstRow.GetLayout() : null;

  // B.FORWARD = 0 or 1? B.BACKWARD = 1 or 0? Let's check ComputeRelativeDirection
  // For GEOMETRIC + DIR_LEFT: should be BACKWARD
  var compDir = firstRow.ComputeRelativeDirection;
  if (compDir) {
    results.dir_left_14 = compDir.call(firstRow, 14, results.layout);
    results.dir_right_15 = compDir.call(firstRow, 15, results.layout);
    results.dir_up_12 = compDir.call(firstRow, 12, results.layout);
    results.dir_down_13 = compDir.call(firstRow, 13, results.layout);
  }

  // Call FindNextFocusableChildGeometric directly
  if (firstRow.FindNextFocusableChildGeometric) {
    // Need to know the B enum values. From ComputeRelativeDirection results above:
    var backward = results.dir_left_14; // this is what BACKWARD is
    var forward = results.dir_right_15;
    results.backwardVal = backward;
    results.forwardVal = forward;

    // Set active child to first card to test LEFT at edge
    var savedFocus = firstRow.m_FocusChild;
    firstRow.m_FocusChild = kids[0];
    var geoResult = firstRow.FindNextFocusableChildGeometric(backward, 14);
    results.geoLeftAtFirst = geoResult ? {
      found: true,
      elClass: (geoResult.Element || geoResult.m_element)?.className?.substring(0, 50)
    } : null;

    // Test RIGHT at last card
    firstRow.m_FocusChild = kids[kids.length - 1];
    var geoResultR = firstRow.FindNextFocusableChildGeometric(forward, 15);
    results.geoRightAtLast = geoResultR ? {
      found: true,
      elClass: (geoResultR.Element || geoResultR.m_element)?.className?.substring(0, 50)
    } : null;

    firstRow.m_FocusChild = savedFocus;
  } else {
    results.geoAvailable = false;
  }

  // Check FindNextFocusableChildInDirection too (for ROW mode)
  if (firstRow.FindNextFocusableChildInDirection) {
    var dirRes = firstRow.FindNextFocusableChildInDirection(0, results.dir_left_14, 14);
    results.dirLeftAtFirst = dirRes ? { found: true } : null;
    var lastIdx = kids.length - 1;
    var dirResR = firstRow.FindNextFocusableChildInDirection(lastIdx, results.dir_right_15, 15);
    results.dirRightAtLast = dirResR ? { found: true } : null;
  }

  // Check if the full BTryInternalNavigation walks up beyond our patch
  // Get the nav tree walk method source (HandleDirectionNavigation or similar)
  var ctrlProto = Object.getPrototypeOf(ctrl);
  var methods = Object.getOwnPropertyNames(ctrlProto).filter(function(n) {
    return typeof ctrlProto[n] === 'function' && n.toLowerCase().indexOf('nav') >= 0;
  });
  results.controllerNavMethods = methods;

  // Check if there's a HandleDirectionNavigation on the tree
  var treeProto = Object.getPrototypeOf(main);
  var treeMethods = Object.getOwnPropertyNames(treeProto).filter(function(n) {
    return typeof treeProto[n] === 'function' && (n.indexOf('Direction') >= 0 || n.indexOf('Internal') >= 0 || n.indexOf('Navigate') >= 0);
  });
  results.treeNavMethods = treeMethods;

  // Get the navigation walk-up logic source
  if (treeProto.BHandleDirectionNavigation) {
    results.BHandleDirectionNavSource = treeProto.BHandleDirectionNavigation.toString().substring(0, 800);
  }
  // Also check HandleDirectionNavigation
  if (treeProto.HandleDirectionNavigation) {
    results.HandleDirectionNavSource = treeProto.HandleDirectionNavigation.toString().substring(0, 800);
  }

  // Install persistent logging on the wrapper + first row + parent
  var DIR_NAMES = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
  window.__ds_nav_log = [];
  
  // Already patched, so wrap our existing patch with logging
  var curRow = firstRow.BTryInternalNavigation;
  firstRow.BTryInternalNavigation = function(dir, flag) {
    var res = curRow.call(firstRow, dir, flag);
    var entry = '[DS-NAV] row0.BTryInternalNavigation(' + (DIR_NAMES[dir]||dir) + ') activeIdx=' + 
      (firstRow.GetActiveChildIndex ? firstRow.GetActiveChildIndex() : '?') + ' => ' + res;
    console.warn(entry);
    window.__ds_nav_log.push(entry);
    return res;
  };

  var curWrapper = wrapperNode.BTryInternalNavigation;
  wrapperNode.BTryInternalNavigation = function(dir, flag) {
    var res = curWrapper.call(wrapperNode, dir, flag);
    var entry = '[DS-NAV] wrapper.BTryInternalNavigation(' + (DIR_NAMES[dir]||dir) + ') => ' + res;
    console.warn(entry);
    window.__ds_nav_log.push(entry);
    return res;
  };

  results.loggingInstalled = true;

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
