/* Automatic Safe Mode: when Home started mounting but never completed on N
   consecutive boots, the next boot skips the Home patches (shelves, recents
   replacement) so Steam's own Home stays usable; the QAM banner is the way out.
   Only "started but never completed" counts — a session where Home was never
   opened is not a failure. localStorage-persisted bookkeeping, no timers. */
const KEY = "ds-boot-outcomes-v1";
export const SAFE_MODE_AFTER_INCOMPLETE_BOOTS = 3;

type Outcomes = { pending: boolean; incompleteStreak: number; safeMode: boolean };

const listeners = new Set<() => void>();
let cached: Outcomes | null = null;

function read(): Outcomes {
  if (cached) return cached;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cached = {
      pending: parsed?.pending === true,
      incompleteStreak: Number(parsed?.incompleteStreak) || 0,
      safeMode: parsed?.safeMode === true,
    };
  } catch {
    cached = { pending: false, incompleteStreak: 0, safeMode: false };
  }
  return cached;
}

function write(next: Outcomes): void {
  cached = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch {}
  for (const l of listeners) { try { l(); } catch {} }
}

/* Call once per boot BEFORE deciding whether to install the Home patches:
   folds the previous boot's outcome in (a still-pending flag means that boot
   started Home and never finished) and returns whether Safe Mode applies now. */
export function evaluateBootOutcome(): boolean {
  const s = read();
  if (s.safeMode) return true;
  const streak = s.pending ? s.incompleteStreak + 1 : 0;
  const safeMode = streak >= SAFE_MODE_AFTER_INCOMPLETE_BOOTS;
  write({ pending: false, incompleteStreak: streak, safeMode });
  return safeMode;
}

export function recordBootStarted(): void {
  const s = read();
  if (s.pending) return;
  write({ ...s, pending: true });
}

export function recordBootCompleted(): void {
  const s = read();
  if (!s.pending && s.incompleteStreak === 0) return;
  write({ ...s, pending: false, incompleteStreak: 0 });
}

export function isSafeModeActive(): boolean {
  return read().safeMode;
}

// User chose to leave Safe Mode: clear the streak; the patches install on the next boot.
export function leaveSafeMode(): void {
  write({ pending: false, incompleteStreak: 0, safeMode: false });
}

export function subscribeSafeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function __resetSafeModeForTest(keepStorage = false): void {
  cached = null;
  if (keepStorage) return;
  try { globalThis.localStorage?.removeItem(KEY); } catch {}
}
