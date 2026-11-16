import { call } from './host/decky';

type PerfSnapshot = { cpuPercent: number | null; memAvailablePercent: number | null; supported: boolean };

const PERF_TTL = 30000;
const _listeners = new Set<() => void>();
let _snap: PerfSnapshot | null = null;
let _snapAt = 0;
let _inflight = false;

function notify(): void {
  for (const l of _listeners) { try { l(); } catch {} }
}

export function subscribePerfState(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

async function refreshPerf(): Promise<void> {
  _inflight = true;
  try {
    const res = await call<[], PerfSnapshot>('get_perf_snapshot');
    _snap = res;
    _snapAt = Date.now();
    notify();
  } catch {} finally {
    _inflight = false;
  }
}

function ensureFresh(): void {
  if (_inflight) return;
  if (_snap && Date.now() - _snapAt < PERF_TTL) return;
  void refreshPerf();
}

export function getPerfSnapshot(): PerfSnapshot | null {
  return _snap;
}

export function requestPerfRefresh(): void {
  ensureFresh();
}

function evalHighCpu(rule: any): boolean {
  if (!_snap || _snap.cpuPercent == null) return true;
  return _snap.cpuPercent >= Number(rule?.above ?? 80);
}

function evalLowMemory(rule: any): boolean {
  if (!_snap || _snap.memAvailablePercent == null) return true;
  return _snap.memAvailablePercent <= Number(rule?.below ?? 15);
}

// The rAF sampler runs only while a lowFrameBudget rule is evaluated and stops itself afterwards.
const FRAME_RING = 30;
const FRAME_STOP_AFTER = 45000;
let _frameDeltas: number[] = [];
let _rafId: number | null = null;
let _rafWin: any = null;
let _lastFrameEvalAt = 0;
let _lastFrameTs = 0;

function frameWin(): any {
  try {
    const bp = (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
    if (bp && typeof bp.requestAnimationFrame === 'function') return bp;
  } catch {}
  return globalThis as any;
}

function frameTick(now: number): void {
  if (_lastFrameTs > 0) {
    const d = now - _lastFrameTs;
    if (d > 0 && d < 1000) { _frameDeltas.push(d); if (_frameDeltas.length > FRAME_RING) _frameDeltas.shift(); }
  }
  _lastFrameTs = now;
  if (Date.now() - _lastFrameEvalAt > FRAME_STOP_AFTER) { stopFrameSampler(); return; }
  try { _rafId = _rafWin.requestAnimationFrame(frameTick); } catch { _rafId = null; }
}

function startFrameSampler(): void {
  if (_rafId != null) return;
  _rafWin = frameWin();
  _lastFrameTs = 0;
  _frameDeltas = [];
  try { _rafId = _rafWin.requestAnimationFrame(frameTick); } catch { _rafId = null; }
}

export function stopFrameSampler(): void {
  if (_rafId != null && _rafWin) { try { _rafWin.cancelAnimationFrame(_rafId); } catch {} }
  _rafId = null;
  _lastFrameTs = 0;
}

function medianFrameMs(): number | null {
  if (_frameDeltas.length < 5) return null;
  const sorted = [..._frameDeltas].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function evalLowFrameBudget(rule: any): boolean {
  _lastFrameEvalAt = Date.now();
  startFrameSampler();
  const ms = medianFrameMs();
  if (ms == null || ms <= 0) return true;
  const belowFps = Number(rule?.belowFps);
  return 1000 / ms < (Number.isFinite(belowFps) ? belowFps : 45);
}

/** Unknown kinds and state fail open. */
export function evalPerfRule(rule: any): boolean {
  const kind = String(rule?.kind || '');
  if (kind === 'lowFrameBudget') return evalLowFrameBudget(rule);
  ensureFresh();
  if (kind === 'highCpu') return evalHighCpu(rule);
  if (kind === 'lowMemory') return evalLowMemory(rule);
  return true;
}

export function perfRuleHasData(rule: any): boolean {
  const kind = String(rule?.kind || '');
  if (kind === 'lowFrameBudget') { _lastFrameEvalAt = Date.now(); startFrameSampler(); return medianFrameMs() != null; }
  ensureFresh();
  return _snap != null;
}

const PERF_RULE_KINDS = ['highCpu', 'lowMemory', 'lowFrameBudget'] as const;
export function isPerfRuleKind(kind: string): boolean {
  return (PERF_RULE_KINDS as readonly string[]).includes(kind);
}
