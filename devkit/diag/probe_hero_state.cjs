// Inspect the per-shelf hero rendering state — which shelves carry the
// hero, what URL is currently bound to each <img>, whether the image is
// hot-cached, and whether the URL matches what `getNativeHeroUrls` would
// currently return. Useful when "hero art doesn't refresh after I change
// it" is reproducible.
//
// Usage: node devkit/diag/probe_hero_state.cjs bp
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.argv[2] || 'bp';

runAndPrint(target, `(function(){
  const out = {};
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no ds root' };

  const heroShelves = Array.from(root.querySelectorAll('.ds-shelf'));
  out.totalShelves = heroShelves.length;
  out.heroEnabledShelves = root.querySelectorAll('.ds-shelf[data-ds-hero-enabled="true"]').length;
  out.heroPromotedShelves = root.querySelectorAll('.ds-shelf[data-ds-recents-slot="true"]').length;

  out.perShelf = heroShelves.slice(0, 6).map((shelf, idx) => {
    const id = shelf.getAttribute('data-shelfid');
    const enabled = shelf.getAttribute('data-ds-hero-enabled') === 'true';
    const promoted = shelf.getAttribute('data-ds-recents-slot') === 'true';
    const hero = shelf.querySelector('[data-ds-per-shelf-hero="true"]');
    const imgs = hero ? Array.from(hero.querySelectorAll('img')) : [];
    return {
      idx,
      id,
      enabled,
      promoted,
      heroNode: !!hero,
      imgs: imgs.map(img => ({
        src: (img.src || '').substring(0, 100),
        complete: img.complete,
        naturalW: img.naturalWidth,
        opacity: getComputedStyle(img).opacity,
      })),
    };
  });

  // Hot cache size (in-memory blob URL map populated by imageCache.ts)
  try {
    const hot = window.__DECK_SHELVES_DEBUG__?.imageCacheHotKeys;
    out.hotCacheKeyCount = Array.isArray(hot) ? hot.length : 'n/a';
  } catch {}

  // Persistent cache — Cache Storage entries with our key
  try {
    if (typeof caches !== 'undefined') {
      // best-effort: just count caches with our prefix
      caches.keys().then(ks => { /* fire and forget */ });
      out.cachesApiAvailable = true;
    }
  } catch {}

  return out;
})()`);
