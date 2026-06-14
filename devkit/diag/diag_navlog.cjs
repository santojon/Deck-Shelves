#!/usr/bin/env node
// Instrument BTryInternalNavigation to log actual calls during gamepad nav
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: node diag_navlog.cjs <target>\n'); process.exit(1); }

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

// Phase 1: Install logging hooks
var installExpr = `(function() {
  window.__ds_nav_log = [];
  var ctrl = window.FocusNavController;
  var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  var trees = ctx.m_rgGamepadNavigationTrees || [];
  var main;
  for (var i = 0; i < trees.length; i++) {
    if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
  }
  if (!main) return JSON.stringify({ error: 'no main tree' });
  var root = main.Root || main.m_Root || main;

  var DIR_NAMES = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };

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

  // Find all rows
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

  // Instrument first row + its children + parent chain
  var firstRow = rows[0];
  if (!firstRow) return JSON.stringify({ error: 'no rows' });

  function getNodeLabel(node) {
    var el = node.Element || node.m_element || node.m_Element;
    var cn = el ? (el.className || '').toString().substring(0, 50) : '?';
    var layout = typeof node.GetLayout === 'function' ? node.GetLayout() : '?';
    return cn + ' [layout=' + layout + ']';
  }

  // Wrap BTryInternalNavigation on first row
  var origRow = firstRow.BTryInternalNavigation.bind(firstRow);
  firstRow.BTryInternalNavigation = function(dir, flag) {
    var result = origRow(dir, flag);
    window.__ds_nav_log.push({
      node: 'ds-row-scroll[0]',
      dir: DIR_NAMES[dir] || dir,
      result: result,
      activeIdx: firstRow.GetActiveChildIndex ? firstRow.GetActiveChildIndex() : null,
      cc: (firstRow.m_rgChildren || []).length
    });
    return result;
  };

  // Wrap BTryInternalNavigation on wrapper
  var origWrapper = wrapperNode.BTryInternalNavigation.bind(wrapperNode);
  wrapperNode.BTryInternalNavigation = function(dir, flag) {
    var result = origWrapper(dir, flag);
    window.__ds_nav_log.push({
      node: 'deck-shelves-root',
      dir: DIR_NAMES[dir] || dir,
      result: result,
      activeIdx: wrapperNode.GetActiveChildIndex ? wrapperNode.GetActiveChildIndex() : null
    });
    return result;
  };

  // Wrap on scroll area parent
  var scrollParent = wrapperNode.m_Parent;
  if (scrollParent) {
    var origParent = scrollParent.BTryInternalNavigation.bind(scrollParent);
    scrollParent.BTryInternalNavigation = function(dir, flag) {
      var result = origParent(dir, flag);
      window.__ds_nav_log.push({
        node: 'scroll-parent(' + getNodeLabel(scrollParent) + ')',
        dir: DIR_NAMES[dir] || dir,
        result: result,
        activeIdx: scrollParent.GetActiveChildIndex ? scrollParent.GetActiveChildIndex() : null,
        cc: (scrollParent.m_rgChildren||[]).length
      });
      return result;
    };
  }

  // Also wrap first few card children of first row
  var rowKids = firstRow.m_rgChildren || [];
  for (var c = 0; c < Math.min(2, rowKids.length); c++) {
    (function(child, cidx) {
      var origChild = child.BTryInternalNavigation.bind(child);
      child.BTryInternalNavigation = function(dir, flag) {
        var result = origChild(dir, flag);
        window.__ds_nav_log.push({
          node: 'card[' + cidx + ']',
          dir: DIR_NAMES[dir] || dir,
          result: result
        });
        return result;
      };
    })(rowKids[c], c);
  }

  return JSON.stringify({ installed: true, rowsFound: rows.length, firstRowKids: rowKids.length });
})()`;

// Phase 2: Read logs
var readExpr = `JSON.stringify(window.__ds_nav_log || [])`;

client.on('open', function() {
  // Install hooks
  send('Runtime.evaluate', { expression: installExpr, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    process.stdout.write('=== HOOKS INSTALLED ===\n');
    try { process.stdout.write(JSON.stringify(JSON.parse(val), null, 2) + '\n'); }
    catch(e) { process.stdout.write(val + '\n'); }
    process.stdout.write('\nNow press LEFT on first card of first shelf, then wait 5s...\n');

    // Wait 8 seconds for user to press LEFT
    setTimeout(function() {
      send('Runtime.evaluate', { expression: readExpr, returnByValue: true }, function(err, result2) {
        var val2 = result2 && result2.result && result2.result.value;
        process.stdout.write('\n=== NAV LOG ===\n');
        try { process.stdout.write(JSON.stringify(JSON.parse(val2), null, 2) + '\n'); }
        catch(e) { process.stdout.write(val2 + '\n'); }
        client.close();
        process.exit(0);
      });
    }, 8000);
  });
});
