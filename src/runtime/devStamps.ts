/* Dev-build-only renderer globals for on-device inspection over the debugger.
   Every helper is a no-op in release builds (`__DEV__` is a compile-time constant,
   so the bodies are dropped) and never throws. Diagnostics that ship — the log
   ring, the perf snapshot, the save-result flags, the inputs of the Diagnostics
   panel — do not go through here; those are read at runtime, these are not. */

function scope(): any {
  return globalThis as any;
}

export function devStamp(name: string, value: unknown): void {
  if (!__DEV__) return;
  try { scope()[name] = value; } catch {}
}

export function devCount(name: string): void {
  if (!__DEV__) return;
  try { const g = scope(); g[name] = (g[name] ?? 0) + 1; } catch {}
}

// Append to a bounded ring (oldest entries drop once `cap` is reached).
export function devTrace(name: string, entry: unknown, cap = 50): void {
  if (!__DEV__) return;
  try {
    const g = scope();
    if (!Array.isArray(g[name])) g[name] = [];
    g[name].push(entry);
    if (g[name].length > cap) g[name].shift();
  } catch {}
}

export function devStampKey(name: string, key: string, value: unknown): void {
  if (!__DEV__) return;
  try { const g = scope(); g[name] = g[name] || {}; g[name][key] = value; } catch {}
}

export function devCountKey(name: string, key: string): void {
  if (!__DEV__) return;
  try { const g = scope(); g[name] = g[name] || {}; g[name][key] = (g[name][key] ?? 0) + 1; } catch {}
}
