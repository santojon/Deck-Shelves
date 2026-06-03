#!/usr/bin/env node
// Decky UI availability probe — checks which `@decky/ui` exports actually
// resolved on the SharedJSContext (where the plugin runs). Falsy exports
// fall through to `src/shims/decky-ui.ts` passthroughs.
//
// Symptom that surfaced this: shelf-list rows showed only their action
// buttons (no title) and EditShelfModal hid its title input. Cause:
// Decky's `findModuleExport` couldn't match Steam's Field on this Steam
// version, so `decky.Field` was undefined and the shim swallowed the
// `label` / `description` props.
//
// Usage:  node diag_decky_ui_availability.cjs <target-id>
//   (pick the SharedJSContext target id)
// Or via CLI:  python3 scripts/devtools/deck/cli.py diag run decky_ui_availability
'use strict';

var ws = require('ws');
var target = process.argv[2];
if (!target) {
  process.stderr.write('Usage: diag_decky_ui_availability.cjs <target-id>\n');
  process.exit(2);
}

var HOST = process.env.DECK_CDP_HOST || process.env.DECK_HOST || '127.0.0.1';
var PORT = process.env.DECK_CDP_PORT || '8081';
var client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
var msgId = 1;

var expression = [
  '(function () {',
  '  var out = {};',
  '  var decky = window.DFL || window.deckyFrontendLib;',
  '  out.deckyAvailable = !!decky;',
  '  if (!decky) return JSON.stringify(out);',
  '  var keys = ["Field","Focusable","ToggleField","TextField","Dropdown","DropdownItem","DialogButton","DialogCheckbox","ConfirmModal","ButtonItem","SliderField","Tabs","Spinner","Menu","MenuItem","showContextMenu","showModal","Navigation","PanelSection","PanelSectionRow","DialogBody","DialogControlsSection","DialogHeader","DialogFooter","ScrollPanel","ScrollPanelGroup","SidebarNavigation","ReorderableList"];',
  '  out.exports = {};',
  '  for (var i = 0; i < keys.length; i++) {',
  '    var k = keys[i];',
  '    out.exports[k] = typeof decky[k];',
  '  }',
  '  out.allKeysSample = Object.keys(decky).slice(0, 60);',
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
