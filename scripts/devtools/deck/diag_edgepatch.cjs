#!/usr/bin/env node
// Check if ds-row-scroll nodes have edge navigation patch applied
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: node diag_edgepatch.cjs <target>\n'); process.exit(1); }

var client = new ws('ws://192.168.1.15:8081/devtools/page/' + target);
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
  if (!wrapperNode) return JSON.stringify({ error: 'no wrapper node found' });

  // Find ds-row-scroll children (recursively)
  var rows = [];
  function findRows(node) {
    var ch = node.m_rgChildren || [];
    for (var i = 0; i < ch.length; i++) {
      var el = ch[i].Element || ch[i].m_element || ch[i].m_Element;
      if (el && typeof el.className === 'string' && el.className.indexOf('ds-row-scroll') >= 0) {
        rows.push(ch[i]);
      } else {
        findRows(ch[i]);
      }
    }
  }
  findRows(wrapperNode);

  var DIR_LEFT = 14;
  var DIR_RIGHT = 15;
  var results = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var el = row.Element || row.m_element || row.m_Element;
    var patched = !!row['__ds_edge_patched__'];
    var layout = typeof row.GetLayout === 'function' ? row.GetLayout() : null;
    var cc = (row.m_rgChildren || []).length;
    var navSrc = row.BTryInternalNavigation ? row.BTryInternalNavigation.toString().substring(0, 200) : null;

    // Test: call BTryInternalNavigation with DIR_LEFT
    var savedActive = row.GetActiveChildIndex ? row.GetActiveChildIndex() : null;
    var leftResult = null;
    var rightResult = null;
    try {
      // Set active child to first (index 0) and test LEFT
      if (row.m_rgChildren && row.m_rgChildren.length > 0) {
        var firstChild = row.m_rgChildren[0];
        // Save and set focus to first child
        var oldFocus = row.m_FocusChild;
        row.m_FocusChild = firstChild;
        leftResult = row.BTryInternalNavigation(DIR_LEFT, false);
        row.m_FocusChild = oldFocus;
      }
    } catch(e) { leftResult = 'error: ' + e.message; }

    try {
      // Set active child to last and test RIGHT
      if (row.m_rgChildren && row.m_rgChildren.length > 0) {
        var lastChild = row.m_rgChildren[row.m_rgChildren.length - 1];
        var oldFocus2 = row.m_FocusChild;
        row.m_FocusChild = lastChild;
        rightResult = row.BTryInternalNavigation(DIR_RIGHT, false);
        row.m_FocusChild = oldFocus2;
      }
    } catch(e) { rightResult = 'error: ' + e.message; }

    results.push({
      idx: r,
      patched: patched,
      layout: layout,
      childCount: cc,
      className: el ? el.className : null,
      navSrcStart: navSrc,
      leftAtFirst: leftResult,
      rightAtLast: rightResult,
      activeChildIdx: savedActive
    });
  }

  return JSON.stringify({ wrapperFound: true, rowCount: rows.length, rows: results });
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
