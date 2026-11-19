import { hostWindow, isObject, now, reportError, reportOnce, type GuardRecord, type Installation, type TabList } from "./ownQamTabBase";

const FAILURE_LIMIT = 2;
export const PAUSE_HOURS = 12;
const PAUSE_EXPIRY_MS = PAUSE_HOURS * 60 * 60 * 1000;

type SessionMarker = { sid: string };

function readMarker(inst: Installation): SessionMarker | null {
  try {
    const m = hostWindow()[inst.markerName];
    return isObject(m) && typeof m.sid === "string" ? (m as SessionMarker) : null;
  } catch {
    return null;
  }
}

function ensureMarker(inst: Installation): SessionMarker {
  const existing = readMarker(inst);
  if (existing) return existing;
  const created: SessionMarker = { sid: `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` };
  try {
    Object.defineProperty(hostWindow(), inst.markerName, { value: created, configurable: true, writable: true });
  } catch {}
  return created;
}

function storage(): Storage | null {
  try {
    return ((globalThis as any).localStorage as Storage | undefined) ?? null;
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function emptyRecord(): GuardRecord {
  return { n: 0, p: 0, d: "", o: 0, k: 0 };
}

function readRecord(key: string): GuardRecord {
  try {
    const raw = storage()?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return emptyRecord();
    const d = typeof parsed.d === "string" ? parsed.d : "";
    return { n: num(parsed.n), p: num(parsed.p), d, o: num(parsed.o), k: num(parsed.k) };
  } catch {
    return emptyRecord();
  }
}

function saveRecord(key: string, record: GuardRecord): void {
  try { storage()?.setItem(key, JSON.stringify(record)); } catch {}
}

export function writeRecord(inst: Installation): void {
  saveRecord(inst.o.guardKey, inst.record);
}

export function endPause(record: GuardRecord): void {
  record.n = FAILURE_LIMIT - 1;
  record.p = 0;
  record.o = 0;
  record.k = 0;
}

function pauseEnds(record: GuardRecord, on: boolean): boolean {
  const age = now() - record.p;
  return age < 0 || age >= PAUSE_EXPIRY_MS || (on && record.o > 0);
}

// A session whose last draw failed continues the count its completed draws had cleared.
export function evaluateGuard(inst: Installation, on: boolean): boolean {
  const record = readRecord(inst.o.guardKey);
  const sid = ensureMarker(inst).sid;
  if (record.d && record.d !== sid) record.n = Math.max(record.n, record.k) + 1;
  record.d = "";
  record.k = 0;
  if (record.n >= FAILURE_LIMIT && !record.p) record.p = now();
  const paused = record.n >= FAILURE_LIMIT && !pauseEnds(record, on);
  if (!paused && record.n >= FAILURE_LIMIT) endPause(record);
  if (paused && !on) record.o = 1;
  inst.record = record;
  writeRecord(inst);
  return paused;
}

function arm(inst: Installation): boolean {
  const marker = readMarker(inst);
  if (!marker) return false;
  if (inst.record.d !== marker.sid) {
    inst.record.d = marker.sid;
    writeRecord(inst);
  }
  inst.armed = true;
  return true;
}

// A stop during a draw, or before its confirmation, takes back this session's mark.
export function disarm(inst: Installation): void {
  if (!inst.armed) return;
  inst.armed = false;
  const sid = readMarker(inst)?.sid;
  const stored = readRecord(inst.o.guardKey);
  if (!sid || stored.d !== sid) return;
  stored.d = "";
  saveRecord(inst.o.guardKey, stored);
}

function settleDraw(inst: Installation): void {
  inst.armed = false;
  const r = inst.record;
  if (r.n || r.d) {
    if (r.n) r.k = r.n;
    r.n = 0;
    r.d = "";
    writeRecord(inst);
  }
  if (inst.firstDrawDone) return;
  inst.firstDrawDone = true;
  reportOnce(inst, "first-draw", "info", "Quick Access tab: first draw completed");
  if (!inst.o.onFirstDraw) return;
  try { inst.o.onFirstDraw(); } catch (err) { reportError(inst, "first draw report", err); }
}

// Runs after the commit: a failed draw has unmounted the tab mark by then.
function confirmDraw(inst: Installation): void {
  if (!inst.live || inst.marksMounted === 0) return;
  try { settleDraw(inst); } catch (err) { reportError(inst, "draw record", err); }
}

// Every render that draws the entry is watched: a later draw can fail as well.
export function watchDraw(inst: Installation, lists: TabList[]): void {
  if (!lists.length || !inst.canConfirm || !arm(inst)) return;
  queueMicrotask(() => confirmDraw(inst));
}
