const KEY = "ds-boot-outcomes-v1";
const SESSION_MARK = "__DECK_SHELVES_BOOT_EVALUATED__";
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

// `window` survives hot-swaps and reloads; only a Steam restart replaces it.
function firstEvaluationOfSession(): boolean {
  const w = globalThis as any;
  if (w[SESSION_MARK] === true) return false;
  w[SESSION_MARK] = true;
  return true;
}

// Call before installing the Home patches; only a session's first call records the previous boot.
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

export function recordBootCompleted(): void {
  const s = read();
  if (s.completed) return;
  write({ ...s, started: true, completed: true });
}

export function isSafeModeActive(): boolean {
  return read().safeMode;
}

export function leaveSafeMode(): void {
  write({ ...EMPTY });
}

export function subscribeSafeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function __resetSafeModeForTest(keepStorage = false): void {
  cached = null;
  delete (globalThis as any)[SESSION_MARK];
  if (keepStorage) return;
  try { globalThis.localStorage?.removeItem(KEY); } catch {}
}
