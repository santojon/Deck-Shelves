// Inspect Friends & Chat tab geometry vs the default QAM popup width. Look
// for the React class / attribute / CSS variable that lets that tab take
// the full viewport, so the Deck Shelves panel can opt in via the same hook.
//
// Usage: node devkit/diag/probe_qam_width.cjs qam
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.argv[2] || 'qam';

runAndPrint(target, `(function(){
  const out = {};
  // QAM root candidates Steam may use across builds.
  const roots = Array.from(document.querySelectorAll('[class*="QuickAccessMenu"], [class*="quickaccessmenu"], [class*="quickAccess"]'));
  out.qamRootCount = roots.length;
  out.qamRoots = roots.slice(0, 4).map(r => {
    const cs = getComputedStyle(r);
    const rect = r.getBoundingClientRect();
    return {
      cls: r.className.substring(0, 100),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      maxWidth: cs.maxWidth,
      minWidth: cs.minWidth,
      transform: cs.transform.substring(0, 60),
      dataAttrs: Object.fromEntries(Array.from(r.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
    };
  });

  // Friends & chat root — Steam usually exposes a friends/chat tab inside QAM.
  const friendsCandidates = Array.from(document.querySelectorAll('[aria-label*="friend" i], [aria-label*="amigos" i], [class*="friends" i], [class*="chat" i]')).slice(0, 4);
  out.friendsCandidates = friendsCandidates.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      cls: (el.className || '').toString().substring(0, 120),
      ariaLabel: el.getAttribute('aria-label'),
      width: Math.round(r.width),
      maxWidth: cs.maxWidth,
      position: cs.position,
    };
  });

  // Viewport size for reference
  out.viewport = { w: window.innerWidth, h: window.innerHeight };

  // Inspect transform: scale tricks Steam might use to expand the popup
  const popups = Array.from(document.querySelectorAll('[class*="popup" i], [class*="Popup" i]')).slice(0, 4);
  out.popupHints = popups.map(p => {
    const cs = getComputedStyle(p);
    return { cls: p.className.substring(0, 80), transform: cs.transform.substring(0, 60), width: Math.round(p.getBoundingClientRect().width) };
  });

  return out;
})()`);
