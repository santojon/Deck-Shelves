/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { discoverClassMap, setRuntimeClassMap, getRuntimeClassMap, discoverNativeCardDimensions } from '../../core/webpackCompat';

describe('webpackCompat discovery', () => {
  it('discovers viewport token from overflow container', () => {
    const doc = document as Document;
    document.body.innerHTML = '';
    const el = doc.createElement('div');
    el.className = '_vpToken Panel';
    el.style.overflowY = 'auto';
    doc.body.appendChild(el);
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

describe('getRuntimeClassMap sources', () => {
  const g = globalThis as any;
  const seeded = { viewport: '_seed' };
  const targetDoc = (win: Record<string, unknown> | null) => ({ defaultView: win }) as unknown as Document;
  const withStorage = (value: string | null) => ({ localStorage: { getItem: () => value } });

  beforeEach(() => { delete g.__DS_CLASS_MAP; });
  afterEach(() => { delete g.__DS_CLASS_MAP; });

  it('still returns the seeded map after its storage entry was cleared', () => {
    g.__DS_CLASS_MAP = seeded;
    expect(getRuntimeClassMap(targetDoc(withStorage(null)))).toBe(seeded);
  });

  it('prefers a map set on the target window over the seeded one', () => {
    g.__DS_CLASS_MAP = seeded;
    const override = { viewport: '_override' };
    expect(getRuntimeClassMap(targetDoc({ ...withStorage(null), __DS_CLASS_MAP: override }))).toBe(override);
  });

  it('reads the stored map when no map is set in memory', () => {
    expect(getRuntimeClassMap(targetDoc(withStorage(JSON.stringify({ viewport: '_stored' }))))).toEqual({ viewport: '_stored' });
  });

  it('returns null when no source has a map', () => {
    expect(getRuntimeClassMap(targetDoc(withStorage(null)))).toBeNull();
  });
});
