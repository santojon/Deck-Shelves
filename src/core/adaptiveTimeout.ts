/* Learns a per-call-site timeout from observed durations instead of a fixed
   guess — fast devices get a tighter timeout, slow ones a looser one, no
   manual retuning. Samples persist across restarts. Always clamped to the
   caller's own [floor, ceiling] — only interpolates within a safe range. */

const PERSIST_KEY = "ds-adaptive-timeout-v1";
const SAMPLES_PER_KEY = 20;
const SAFETY_MULTIPLIER = 2;

type SampleStore = Record<string, number[]>;

let samples: SampleStore = loadSamples();

function loadSamples(): SampleStore {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistSamples(): void {
  try {
    (globalThis as any).localStorage?.setItem?.(PERSIST_KEY, JSON.stringify(samples));
  } catch { /* best effort */ }
}

/** Record how long a successful (not timed-out) call actually took. */
export function recordDuration(key: string, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const list = samples[key] ?? (samples[key] = []);
  list.push(ms);
  if (list.length > SAMPLES_PER_KEY) list.shift();
  persistSamples();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

/** Derive a timeout from what's actually been observed for this key, with a
    safety multiplier, clamped to [floor, ceiling]. `fallback` (normally the
    caller's own current hardcoded value) is used until enough samples exist. */
export function getAdaptiveTimeout(
  key: string,
  opts: { floor: number; ceiling: number; fallback: number; minSamples?: number },
): number {
  const list = samples[key];
  const minSamples = opts.minSamples ?? 5;
  if (!list || list.length < minSamples) return opts.fallback;
  const sorted = [...list].sort((a, b) => a - b);
  const p90 = percentile(sorted, 0.9);
  const target = p90 * SAFETY_MULTIPLIER;
  return Math.min(opts.ceiling, Math.max(opts.floor, target));
}

/** Read-only snapshot for the Performance panel — what's been learned so
    far, per key, sorted for stable display. */
export function getLearnedTimeoutsSummary(): Array<{ key: string; sampleCount: number; p90Ms: number }> {
  return Object.entries(samples)
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return { key, sampleCount: list.length, p90Ms: Math.round(percentile(sorted, 0.9)) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetAdaptiveTimeoutForTest(): void {
  samples = {};
}
