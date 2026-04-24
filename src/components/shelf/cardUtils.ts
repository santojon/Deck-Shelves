import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";

// Returns null when the class map isn't ready yet (caller should retry).
// Returns a string (possibly empty) once the map is available.
export function resolveNativeCardClass(doc: Document | null): string | null {
  const map = doc ? getRuntimeClassMap(doc) : null;
  if (!map?.nativeCard) return null;
  const sampleSelector = buildSelectorFromToken(map.nativeCard);
  const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
  if (nativeSample) {
    const rootClasses = Array.from(nativeSample.classList).filter((cls) => (
      cls !== 'Panel' && cls !== 'Focusable' && cls !== 'gpfocus' && cls !== 'gpfocuswithin' && !cls.startsWith('ds-')
    ));
    if (!rootClasses.includes('gpfocuswithin')) rootClasses.push('gpfocuswithin');
    return rootClasses.join(' ');
  }
  return [map.nativeCard, map.nativeCardMods].filter(Boolean).join(' ');
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

