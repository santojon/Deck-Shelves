import { useEffect, useState } from "react";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";

function readForceThemes(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.('deck-shelves-settings-cache-v3');
    if (!raw) return false;
    return JSON.parse(raw)?.forceCssLoaderThemes === true;
  } catch { return false; }
}

const NATIVE_CARD_EXCLUDED = new Set(['Panel', 'Focusable', 'gpfocus', 'gpfocuswithin']);
// No nativeCardWrapper or gpfocuswithin here: themes' focused-state rules would match every card.
const FORCE_THEME_TOKENS = [
  'nativeSemanticCard', 'nativeSemanticCardContainer', 'nativeSemanticCardImage',
  'nativeSemanticCardWrapper', 'nativeCapsule', 'nativeCapsuleImage',
  'nativeCapsuleArt', 'nativeCapsuleContainer', 'nativeCapsuleBg',
  'nativeLibraryItemBox', 'nativeGameCapsule',
];

function addSplitTokens(value: string | undefined, out: Set<string>): void {
  if (!value) return;
  for (const c of value.split(/\s+/)) if (c) out.add(c);
}

function collectSampleClasses(sample: HTMLElement, out: Set<string>): void {
  for (const cls of Array.from(sample.classList)) {
    if (NATIVE_CARD_EXCLUDED.has(cls) || cls.startsWith('ds-')) continue;
    out.add(cls);
  }
}

function addForceThemeExtras(map: any, out: Set<string>): void {
  for (const k of FORCE_THEME_TOKENS) addSplitTokens(map[k], out);
}

// null until the class map is ready; the caller retries.
export function resolveNativeCardClass(doc: Document | null): string | null {
  const map = doc ? getRuntimeClassMap(doc) : null;
  if (!map?.nativeCard) return null;
  const sampleSelector = buildSelectorFromToken(map.nativeCard);
  const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
  const out = new Set<string>();
  if (nativeSample) {
    collectSampleClasses(nativeSample, out);
  } else {
    if (map.nativeCard) out.add(map.nativeCard);
    addSplitTokens(map.nativeCardMods, out);
  }
  if (readForceThemes()) addForceThemeExtras(map, out);
  return Array.from(out).join(' ');
}

function findNativeCardSample(doc: Document | null): HTMLElement | null {
  const map = doc ? getRuntimeClassMap(doc) : null;
  if (!map?.nativeCard) return null;
  const sel = buildSelectorFromToken(map.nativeCard);
  return sel ? (doc?.querySelector(`${sel}:not(.ds-card)`) as HTMLElement | null) : null;
}

export function applyNativeAfterAnimation(doc: Document | null, target: HTMLElement | null): void {
  if (!target) return;
  try {
    const sample = findNativeCardSample(doc);
    if (!sample) return;
    const animName = (getComputedStyle(sample, '::after').animationName || '').split(',')[0] || '';
    if (animName && animName !== 'none') target.style.setProperty('--ds-native-after-animation', animName);
  } catch {}
}

export function useNearViewport(ref: { current: HTMLElement | null }, rootMargin: string): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, near]);
  return near;
}

export function retryWithIntervals(fn: () => boolean, intervals: number[]): () => void {
  let attempts = 0;
  let timer: number | null = null;
  const tryRun = () => {
    attempts += 1;
    if (!fn() && attempts < intervals.length) {
      timer = window.setTimeout(tryRun, intervals[attempts - 1]);
    }
  };
  tryRun();
  return () => { if (timer) clearTimeout(timer); };
}

