#!/usr/bin/env node
// Check actual gamepad button enum values by scanning ComputeRelativeDirection
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage\n'); process.exit(1); }

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
  var root = main.Root || main.m_Root || main;
  
  // GEOMETRIC = 2, ROW = 3 or something. Let's check layout enum first.
  // Scan compDir for GEOMETRIC layout (already know it's 2)
  var GEOMETRIC = 2;
  
  // Scan button values 0-30 through ComputeRelativeDirection with GEOMETRIC layout
  var geoResults = {};
  for (var btn = 0; btn <= 30; btn++) {
    var dir = root.ComputeRelativeDirection(btn, GEOMETRIC);
    if (dir !== 0) { // 0 appears to be INVALID based on previous diag for most values
      geoResults[btn] = dir;
    }
  }
  
  // Also scan with ROW layout. We know row is one of the layout values.
  // The layout enum S: NONE, ROW, GEOMETRIC, COLUMN, GRID, ROW_REVERSE, COLUMN_REVERSE
  // Let's check all layouts 0-7
  var layoutResults = {};
  for (var layout = 0; layout <= 7; layout++) {
    var btnMap = {};
    for (var btn = 0; btn <= 20; btn++) {
      try {
        var dir = root.ComputeRelativeDirection(btn, layout);
        btnMap[btn] = dir;
      } catch(e) { break; }
    }
    layoutResults[layout] = btnMap;
  }

  // The enum i.pR is used as i.pR[e] for logging. Let's try to find the enum.
  // The BTryInternalNavigation log: i.pR[e] - uses e as key to get name
  // We can extract by checking what names i.pR maps to
  // From ComputeRelativeDirection source, it references i.pR.DIR_LEFT, etc.
  // We need to find the i.pR object. It's in the closure scope.
  
  // ALTERNATIVE: examine the BTryInternalNavigation source to extract variable names
  // Actually, I can search for the buttonNames by trying to find them 
  // in the webpack module scope
  
  // Quick approach: find what values 0-20 mean by testing ROW layout
  // For ROW: LEFT -> BACKWARD, RIGHT -> FORWARD, UP/DOWN -> INVALID
  var rowLayout = null;
  // Find ROW layout number: it's the one where only 2 specific values give non-INVALID
  // and those values correspond to horizontal (LEFT/RIGHT)
  for (var l = 0; l <= 7; l++) {
    var nonInvalid = [];
    for (var b = 0; b <= 20; b++) {
      try {
        var d = root.ComputeRelativeDirection(b, l);
        if (d !== 0) nonInvalid.push(b);
      } catch(e) {}
    }
    if (nonInvalid.length === 2) {
      // This could be ROW (only LEFT/RIGHT valid) or COLUMN (only UP/DOWN valid)
      layoutResults['layout_' + l + '_valid'] = nonInvalid;
    } else if (nonInvalid.length === 4) {
      layoutResults['layout_' + l + '_valid'] = nonInvalid;
    }
  }

  // Find the B enum (FORWARD/BACKWARD/INVALID) by checking GEOMETRIC with known buttons
  // For GEOMETRIC: LEFT/UP -> BACKWARD, RIGHT/DOWN -> FORWARD
  // We know value 12 gives 1 for GEOMETRIC. Let's see what all non-zero values are.
  var allNonZero = {};
  for (var b = 0; b <= 20; b++) {
    var d = root.ComputeRelativeDirection(b, GEOMETRIC);
    if (d !== 0) allNonZero[b] = d;
  }
  
  return JSON.stringify({
    geometricNonZero: allNonZero,
    layoutValidButtons: layoutResults
  }, null, 2);
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
