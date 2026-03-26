#!/usr/bin/env node
// Diagnose DOM position and bounding boxes of mount vs native sections
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) { process.stdout.write('Usage: diag_geometry.cjs <targetId>\n'); process.exit(1); }

var client = new ws('ws://127.0.0.1:8081/devtools/page/' + target);
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
  var mount = document.getElementById('deck-shelves-home-root');
  if (!mount) return JSON.stringify({ error: 'no mount' });

  var mountRect = mount.getBoundingClientRect();

  // Walk up from mount to find the real scroll container
  var parent = mount.parentElement;
  var ancestors = [];
  var el = mount.parentElement;
  var depth = 0;
  while (el && depth < 8) {
    var cs = window.getComputedStyle(el);
    ancestors.push({
      depth: depth,
      tag: el.tagName,
      id: el.id || '',
      cls: (el.className || '').substring(0, 60),
      display: cs.display,
      flexDir: cs.flexDirection,
      position: cs.position,
      overflow: cs.overflow + '/' + cs.overflowY,
      childCount: el.childElementCount,
      rect: { top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height) }
    });
    el = el.parentElement;
    depth++;
  }

  // Find siblings of the mount with their rects
  var siblings = [];
  if (mount.parentElement) {
    var children = Array.from(mount.parentElement.children);
    var mountIdx = children.indexOf(mount);
    children.forEach(function(child, i) {
      var cr = child.getBoundingClientRect();
      siblings.push({
        idx: i,
        isMine: i === mountIdx,
        id: child.id || '',
        cls: (child.className || '').substring(0, 50),
        top: Math.round(cr.top),
        left: Math.round(cr.left),
        width: Math.round(cr.width),
        height: Math.round(cr.height)
      });
    });
  }

  // Find "natural" sections by looking for section-like elements visible on screen
  var sections = [];
  var allSections = document.querySelectorAll('[class*="libraryhomesection"],[class*="LibraryHomeSection"],[class*="_1DLmEVjfX3d7Ec8CW7vJnt"],[class*="homeSection"],[class*="HomeSection"]');
  allSections.forEach(function(sec, i) {
    if (i > 5) return;
    var r = sec.getBoundingClientRect();
    sections.push({
      idx: i,
      cls: (sec.className || '').substring(0, 50),
      top: Math.round(r.top),
      height: Math.round(r.height)
    });
  });

  return JSON.stringify({
    mountRect: { top: Math.round(mountRect.top), left: Math.round(mountRect.left), width: Math.round(mountRect.width), height: Math.round(mountRect.height) },
    ancestors: ancestors,
    siblings: siblings.slice(0, 10),
    siblingCount: siblings.length,
    sections: sections
  });
})()`;

client.on('open', function() {
  send('Runtime.evaluate', { expression: expression, returnByValue: true }, function(err, result) {
    var val = result && result.result && result.result.value;
    if (val) {
      try {
        var parsed = JSON.parse(val);
        process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
      } catch(e) {
        process.stdout.write(val + '\n');
      }
    } else {
      process.stdout.write('NO_VALUE: ' + JSON.stringify(result) + '\n');
    }
    client.close();
    process.exit(0);
  });
});

client.on('error', function(e) { process.stdout.write('ERR: ' + e.message + '\n'); process.exit(1); });
setTimeout(function() { process.stdout.write('TIMEOUT\n'); process.exit(1); }, 10000);
