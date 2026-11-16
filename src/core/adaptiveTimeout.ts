// Learns a per-call-site timeout from observed durations, always clamped to the caller's [floor, ceiling].

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

// `fallback` is used until enough samples exist.
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

export function getLearnedTimeoutsSummary(): Array<{ key: string; sampleCount: number; p90Ms: number }> {
  return Object.entries(samples)
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return { key, sampleCount: list.length, p90Ms: Math.round(percentile(sorted, 0.9)) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function __resetAdaptiveTimeoutForTest(): void {
  samples = {};
}
