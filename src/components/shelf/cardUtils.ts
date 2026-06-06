import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";

function readForceThemes(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.('deck-shelves-settings-cache-v3');
    if (!raw) return false;
    return JSON.parse(raw)?.forceCssLoaderThemes === true;
  } catch { return false; }
}

// Returns null when the class map isn't ready yet (caller should retry).
// Returns a string (possibly empty) once the map is available.
export function resolveNativeCardClass(doc: Document | null): string | null {
  const map = doc ? getRuntimeClassMap(doc) : null;
  if (!map?.nativeCard) return null;
  const sampleSelector = buildSelectorFromToken(map.nativeCard);
  const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
  const out = new Set<string>();
  if (nativeSample) {
    for (const cls of Array.from(nativeSample.classList)) {
      if (cls === 'Panel' || cls === 'Focusable' || cls === 'gpfocus' || cls === 'gpfocuswithin') continue;
      if (cls.startsWith('ds-')) continue;
      out.add(cls);
    }
  } else {
    if (map.nativeCard) out.add(map.nativeCard);
    if (map.nativeCardMods) for (const c of map.nativeCardMods.split(/\s+/)) if (c) out.add(c);
  }
  // Do NOT add `nativeCardWrapper` or `gpfocuswithin` here — both turn
  // theme focused-state selectors into all-card always-on rules.
  // forceCssLoaderThemes adds DFL semantic card tokens (no state classes).
  if (readForceThemes()) {
    const extras = [
      'nativeSemanticCard', 'nativeSemanticCardContainer', 'nativeSemanticCardImage',
      'nativeSemanticCardWrapper', 'nativeCapsule', 'nativeCapsuleImage',
      'nativeCapsuleArt', 'nativeCapsuleContainer', 'nativeCapsuleBg',
      'nativeLibraryItemBox', 'nativeGameCapsule',
    ];
    for (const k of extras) {
      const v = map[k];
      if (!v) continue;
      for (const c of v.split(/\s+/)) if (c) out.add(c);
    }
  }
  return Array.from(out).join(' ');
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

