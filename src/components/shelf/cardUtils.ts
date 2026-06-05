/* eslint-disable complexity */
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
  // INTENTIONALLY NOT adding `nativeCardWrapper` (`_1HIFNGSxh4-jOhPiDynR4C`)
  // here. CDP audit found that themes use this class IN COMBINATION with
  // attribute selectors — TiltedHome's focused-state rule is
  // `_1HIFNGSxh4-jOhPiDynR4C[tabindex] > div:first-child { transform: scale(1.02) }`.
  // Native cards have NO tabindex on the wrapper (it sits 4 levels
  // deeper on a role="link" element); Decky's <Focusable> wraps DS
  // cards with tabindex on the wrapper itself, so adding the native
  // wrapper class made that focused-state selector match EVERY DS
  // card unconditionally, replacing the tilt with a flat scale on all
  // of them. The structural fix requires either a nested-focusable
  // hierarchy mirroring native (Phase 2: NativeGameCard rebuild) or
  // a custom focus primitive (Phase 3: NativeFocusable). For now DS
  // tilt comes from our own shelfStyles.ts rules.
  // INTENTIONALLY NOT adding `gpfocuswithin` here. Steam's nav
  // controller manages that class on the actually-focused element
  // and its ancestors. Adding it statically to every DS card made
  // TiltedHome's focused-state rule (`.gpfocuswithin > div:first-child
  // { transform: scale(1.02) }`) fire on every card, replacing the
  // tilt with a flat scale — which is exactly the regression the user
  // reported as "como se TiltedHome estivesse desativado". Theme
  // rules that depend on gpfocuswithin as a static base style would
  // be incorrect anyway; native cards don't have it as default
  // either (CDP confirmed 0/21 native tiles carry it when not in
  // the focus branch).
  // When forceCssLoaderThemes is on, add DFL semantic card tokens so themes
  // styling Card/CardContainer/CardImage/Capsule/LibraryItemBox also reach
  // DS cards. State classes (FeaturedCapsule = focus-only) intentionally
  // excluded.
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

