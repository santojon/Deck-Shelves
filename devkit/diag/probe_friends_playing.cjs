// Inspect the `friends_playing` smart-shelf state in the live BP window.
// Probes: settings entry, DOM render, sample card appids + name presence.
//
// Usage: node devkit/diag/probe_friends_playing.cjs bp
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.argv[2] || 'bp';

runAndPrint(target, `(function(){
  const out = {};
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no ds root in this target' };

  // Try settings first (BP doesn't always carry the full settings global).
  const all = window.__DECK_SHELVES_SHARED_SETTINGS__?.smartShelves || [];
  let fp = all.find(s => s.source?.mode === 'friends_playing');

  // Fallback: locate by title in the rendered DOM (Portuguese / English).
  let shelfDiv = fp ? root.querySelector('.ds-shelf[data-shelfid="' + fp.id + '"]') : null;
  if (!shelfDiv) {
    const titled = Array.from(root.querySelectorAll('.ds-shelf')).find(s => {
      const t = (s.querySelector('.ds-shelf-title')?.textContent || '').toLowerCase();
      return t.includes('amigos jogando') || t.includes('friends playing') || t.includes('jogando agora');
    });
    if (titled) {
      shelfDiv = titled;
      fp = { id: titled.getAttribute('data-shelfid'), title: titled.querySelector('.ds-shelf-title')?.textContent?.trim() };
    }
  }
  if (!fp) return { error: 'no friends_playing shelf found (settings empty + no matching title in DOM)', shelvesInDom: root.querySelectorAll('.ds-shelf').length };
  out.shelf = fp;
  if (!shelfDiv) return { ...out, dom: 'no DOM render — shelf hidden/empty/not mounted' };

  const cards = shelfDiv.querySelectorAll('.ds-card');
  const sampleCards = Array.from(cards).slice(0, 8).map(c => {
    const appid = c.getAttribute('data-appid');
    const nameEl = c.querySelector('.ds-card-label-name');
    const img = c.querySelector('img');
    return {
      appid,
      name: (nameEl?.textContent || '').trim().substring(0, 50),
      nameIsPlaceholder: /^(#\\d+|App \\d+)$/.test((nameEl?.textContent || '').trim()),
      imgSrc: (img?.src || '').substring(0, 80),
      imgLoaded: img ? img.complete : false,
      hasOverview: appid ? !!window.appStore?.GetAppOverviewByAppID?.(Number(appid)) : false,
    };
  });
  out.dom = {
    totalCards: cards.length,
    cardsWithAppid: shelfDiv.querySelectorAll('.ds-card[data-appid]').length,
    cardsWithName: Array.from(shelfDiv.querySelectorAll('.ds-card-label-name')).filter(n => (n.textContent || '').trim()).length,
    sampleCards,
  };

  // Compare with the friends state cache to see what the resolver should know
  try {
    const fs = window.__DECK_SHELVES_DEBUG__?.friendsState;
    out.friendsState = fs ?? 'unavailable';
  } catch {}

  return out;
})()`);
