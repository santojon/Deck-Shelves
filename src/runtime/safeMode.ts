/* Automatic Safe Mode: when Home started mounting but never completed on too
   many of the recent boots, the next boot skips the Home patches (shelves,
   recents replacement) so Steam's own Home stays usable; the QAM banner is the
   way out. Only "started but never completed" counts — a session where Home
   was never opened is not a failure. localStorage bookkeeping, no timers. */
const KEY = "ds-boot-outcomes-v1";
// Set on `window` by the first evaluation of a Steam session: the bundle can boot again in it.
const SESSION_MARK = "__DECK_SHELVES_BOOT_EVALUATED__";
// Trips when this many of the last SAFE_MODE_BOOT_WINDOW boots were incomplete.
export const SAFE_MODE_AFTER_INCOMPLETE_BOOTS = 3;
export const SAFE_MODE_BOOT_WINDOW = 6;

type BootOutcome = "complete" | "incomplete";
type Outcomes = { started: boolean; completed: boolean; boots: BootOutcome[]; safeMode: boolean };

const EMPTY: Outcomes = { started: false, completed: false, boots: [], safeMode: false };
const listeners = new Set<() => void>();
let cached: Outcomes | null = null;

function isOutcome(value: unknown): value is BootOutcome {
  return value === "complete" || value === "incomplete";
}

// The shape before the window: a streak of incomplete boots that any complete boot reset.
function migrateStreak(parsed: any): BootOutcome[] {
  const streak = Math.min(Number(parsed?.incompleteStreak) || 0, SAFE_MODE_BOOT_WINDOW);
  return Array.from({ length: streak }, () => "incomplete" as const);
}

function parse(raw: string | null): Outcomes {
  const parsed = raw ? JSON.parse(raw) : null;
  const boots: BootOutcome[] = Array.isArray(parsed?.boots)
    ? parsed.boots.filter(isOutcome).slice(-SAFE_MODE_BOOT_WINDOW)
    : migrateStreak(parsed);
  return {
    started: parsed?.started === true || parsed?.pending === true,
    completed: parsed?.completed === true,
    boots,
    safeMode: parsed?.safeMode === true,
  };
}

function read(): Outcomes {
  if (cached) return cached;
  try {
    cached = parse(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    cached = { ...EMPTY };
  }
  return cached;
}

function write(next: Outcomes): void {
  cached = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch {}
  for (const l of listeners) { try { l(); } catch {} }
}

function incompleteBoots(boots: BootOutcome[]): number {
  return boots.filter((b) => b === "incomplete").length;
}

/* `window` outlives the bundle (hot-swap, reload, the other copy of a dual
   install) and only a Steam restart replaces it, so it tells the first
   evaluation of a session from the ones that follow. */
function firstEvaluationOfSession(): boolean {
  const w = globalThis as any;
  if (w[SESSION_MARK] === true) return false;
  w[SESSION_MARK] = true;
  return true;
}

/* Call BEFORE deciding whether to install the Home patches. The first call of
   a Steam session folds the previous boot's outcome into the window (started
   and never completed = incomplete; never started = no entry); a later call in
   the same session only answers, so a bundle booting again mid-mount is not a
   failed boot. Returns whether Safe Mode applies now. */
export function evaluateBootOutcome(): boolean {
  const s = read();
  if (!firstEvaluationOfSession() || s.safeMode) return s.safeMode;
  const outcome: BootOutcome | null = s.started ? (s.completed ? "complete" : "incomplete") : null;
  const boots = outcome ? [...s.boots, outcome].slice(-SAFE_MODE_BOOT_WINDOW) : s.boots;
  const safeMode = incompleteBoots(boots) >= SAFE_MODE_AFTER_INCOMPLETE_BOOTS;
  write({ started: false, completed: false, boots, safeMode });
  return safeMode;
}

export function recordBootStarted(): void {
  const s = read();
  if (s.started) return;
  write({ ...s, started: true });
}

// One completed mount makes the boot complete, whatever a later mount of it does.
export function recordBootCompleted(): void {
  const s = read();
  if (s.completed) return;
  write({ ...s, started: true, completed: true });
}

export function isSafeModeActive(): boolean {
  return read().safeMode;
}

// User chose to leave Safe Mode: forget the window; the patches install on the next boot.
export function leaveSafeMode(): void {
  write({ ...EMPTY });
}

export function subscribeSafeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Like a Steam restart: the bundle's cache and the session mark go; storage only when asked.
export function __resetSafeModeForTest(keepStorage = false): void {
  cached = null;
  delete (globalThis as any)[SESSION_MARK];
  if (keepStorage) return;
  try { globalThis.localStorage?.removeItem(KEY); } catch {}
}
