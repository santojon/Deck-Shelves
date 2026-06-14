#!/usr/bin/env node
// QAM layout inspection probe — dumps the shelf-list rows and any open
// EditShelfModal in compact form so we can spot label-drop / layout
// regressions without screen access. Captures:
//   - shelf-list row markup (label + interactables placement)
//   - whether the EditShelfModal has rendered (source tab content)
//   - composite source UI state (combine dropdown, child source list)
//
// Usage:  node diag_qam_layout.cjs <quickaccess-target-id>
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_qam_layout.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  // Shelf list rows',
  '  var listRoot = document.querySelector(".deck-shelves-shelf-list");',
  '  if (listRoot) {',
  '    var rows = Array.from(listRoot.querySelectorAll("[data-ds-reorder-focused]"));',
  '    out.shelfRows = rows.slice(0, 6).map(function (r, i) {',
  '      var label = r.querySelector(".deck-shelves-label-text");',
  '      var actions = r.querySelector("[data-ds-shelf-actions]");',
  '      var labelRect = label ? label.getBoundingClientRect() : null;',
  '      var actionsRect = actions ? actions.getBoundingClientRect() : null;',
  '      return {',
  '        i: i,',
  '        title: label ? label.textContent : null,',
  '        labelTop: labelRect ? Math.round(labelRect.top) : null,',
  '        actionsTop: actionsRect ? Math.round(actionsRect.top) : null,',
  '        sameLine: labelRect && actionsRect ? Math.abs(labelRect.top - actionsRect.top) < 10 : null,',
  '        rowHTML: r.innerHTML.slice(0, 500),',
  '      };',
  '    });',
  '  } else { out.shelfRows = "list not found"; }',
  '  // Composite UI inside EditShelfModal',
  '  var compositeHints = Array.from(document.querySelectorAll("*")).filter(function (e) {',
  '    return e.textContent && e.children.length === 0 && (e.textContent.includes("composite") || e.textContent.includes("Combinar") || e.textContent.includes("Combine") || e.textContent.includes("Fonte"));',
  '  });',
  '  out.compositeMentions = compositeHints.slice(0, 8).map(function (e) { return (e.textContent || "").slice(0, 80); });',
  '  // Source dropdown current value (modal open)',
  '  var dropdowns = document.querySelectorAll("[class*=Dropdown]");',
  '  out.dropdownCount = dropdowns.length;',
  '  out.dropdownTexts = Array.from(dropdowns).slice(0, 20).map(function (d) {',
  '    var txt = (d.textContent || "").slice(0, 60);',
  '    return txt;',
  '  });',
  '  return JSON.stringify(out);',
  '})()',
].join('\n');

client.on('open', function () {
  client.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression: expression, returnByValue: true }}));
  client.on('message', function (data) {
    var msg = JSON.parse(data);
    if (msg.id !== msgId) return;
    try {
      var payload = JSON.parse(msg.result.result.value);
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } catch (e) {
      process.stderr.write('parse failed: ' + String(e) + '\n');
      process.exit(2);
    }
    client.close();
    process.exit(0);
  });
});

client.on('error', function (e) {
  process.stderr.write('CDP connection failed: ' + String(e) + '\n');
  process.exit(2);
});
