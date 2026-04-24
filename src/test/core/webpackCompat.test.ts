/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { discoverClassMap, setRuntimeClassMap, getRuntimeClassMap, discoverNativeCardDimensions } from '../../core/webpackCompat';

describe('webpackCompat discovery', () => {
  it('discovers viewport token from overflow container', () => {
    const doc = document as Document;
    document.body.innerHTML = '';
    const el = doc.createElement('div');
    el.className = '_vpToken Panel';
    el.style.overflowY = 'auto';
    doc.body.appendChild(el);
    // simulate sizes
    Object.defineProperty(el, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 120, configurable: true });

    const map = discoverClassMap(doc as Document);
    expect(map).toBeTruthy();
    expect(map!.viewport).toBe('_vpToken');
  });

  it('discovers row and card tokens when present', () => {
    const doc = document as Document;
    document.body.innerHTML = '';
    const viewport = doc.createElement('div');
    viewport.className = '_vp Panel';
    viewport.style.overflowY = 'auto';
    doc.body.appendChild(viewport);
    const row = doc.createElement('div');
    row.className = '_rowToken Panel Focusable';
    viewport.appendChild(row);
    // create multiple card-like children
    for (let i=0;i<6;i++){
      const c = doc.createElement('div');
      c.className = '_cardToken Panel';
      c.style.width = '140px';
      c.style.height = '200px';
      row.appendChild(c);
    }
    Object.defineProperty(viewport, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 400, configurable: true });

    const map = discoverClassMap(doc as Document);
    expect(map).toBeTruthy();
    expect(map!.viewport).toBe('_vp');
    expect(map!.row).toBe('_rowToken');
    expect(map!.card).toBe('_cardToken');
  });

  it('falls back to ancestor scanning for token', () => {
    const doc = document as Document;
    document.body.innerHTML = '';
    const parent = doc.createElement('div');
    parent.className = 'Panel _ancToken Focusable';
    const mount = doc.createElement('div');
    mount.id = 'deck-shelves-home-root';
    parent.appendChild(mount);
    doc.body.appendChild(parent);

    const map = discoverClassMap(doc as Document);
    expect(map).toBeTruthy();
    expect(map!.viewport).toBe('_ancToken');
  });

  it('setRuntimeClassMap and getRuntimeClassMap roundtrip', () => {
    const doc = document as Document;
    document.body.innerHTML = '';
    const map = { viewport: '_x' };
    setRuntimeClassMap(doc as Document, map as Record<string, string>);
    const read = getRuntimeClassMap(doc as Document);
    expect(read).toEqual(map);
  });
});

describe('discoverNativeCardDimensions', () => {
  it('returns null when no card images are present', () => {
    document.body.innerHTML = '';
    const result = discoverNativeCardDimensions(document);
    expect(result).toBeNull();
  });

  it('returns null when fewer than 2 cards are found', () => {
    document.body.innerHTML = '';
    const img = document.createElement('img');
    const parent = document.createElement('div');
    parent.style.cursor = 'pointer';
    parent.appendChild(img);
    document.body.appendChild(parent);
    // jsdom returns 0 for getBoundingClientRect, so this won't match the size filter
    const result = discoverNativeCardDimensions(document);
    expect(result).toBeNull();
  });

  it('skips images inside .ds-card', () => {
    document.body.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'ds-card';
    const img = document.createElement('img');
    card.appendChild(img);
    document.body.appendChild(card);
    const result = discoverNativeCardDimensions(document);
    expect(result).toBeNull();
  });
});
