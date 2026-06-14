// Inspects how Decky's SliderField + showValue chip render at runtime,
// reporting label rect, slider track rect, and the value span (if any).
// Use when a slider chip is clipping at the panel edge or the label is
// pushing the bar into too narrow a strip — gives the exact pixel widths
// to size against.
//
// Usage:
//   node devkit/diag/probe_slider_field.cjs
//   PROBE_SCOPE='.deck-shelves-qam-scope' \
//     node devkit/diag/probe_slider_field.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.env.PROBE_TARGET || 'qam';
const scopeSel = process.env.PROBE_SCOPE || '.deck-shelves-qam-scope';
const maxSamples = parseInt(process.env.PROBE_MAX || '4', 10);

runAndPrint(target, `(function(){
  const scope = document.querySelector(${JSON.stringify(scopeSel)});
  if (!scope) return { err: 'scope not found: ${scopeSel}' };
  const sliders = Array.from(scope.querySelectorAll('.SliderControl, .SliderControlPanelGroup'));
  if (!sliders.length) return { err: 'no SliderControl in scope', scope: ${JSON.stringify(scopeSel)} };
  const out = { scope: ${JSON.stringify(scopeSel)}, count: sliders.length, samples: [] };
  for (const s of sliders.slice(0, ${maxSamples})) {
    let row = s;
    for (let i = 0; i < 8; i++) {
      row = row.parentElement;
      if (!row) break;
      if (row.querySelector('[class*="FieldLabel" i]')) break;
    }
    if (!row) continue;
    const fieldLabel = row.querySelector('[class*="FieldLabel" i]');
    const fieldChildren = row.querySelector('[class*="FieldChildrenInner" i], [class*="FieldChildren" i]');
    const sliderRect = s.getBoundingClientRect();
    const labelRect = fieldLabel?.getBoundingClientRect();
    const childRect = fieldChildren?.getBoundingClientRect();
    out.samples.push({
      labelText: (fieldLabel?.textContent || '').trim().substring(0, 80),
      labelW: labelRect ? Math.round(labelRect.width) : null,
      childrenW: childRect ? Math.round(childRect.width) : null,
      slider: { x: Math.round(sliderRect.x), w: Math.round(sliderRect.width) },
      rowCls: (row.className || '').toString().substring(0, 160),
    });
  }
  return out;
})()`);
