/* The Home patch's fallback mount poll as a power-gate task: 500 ms for ~15 s
   on its first start (cold boot) and on `wake()` (renderer reload), 2 s after
   that and on every later return to the Home; it stops once the fallback is
   mounted and whenever the Home is not active, and each return runs one render
   attempt. The patch's body observer and route signals cover a lost mount. */
import { registerPeriodic } from "./powerGate";
import { timerCreated, timerDisposed } from "../core/perfMetrics";

export const FALLBACK_FAST_MS = 500;
export const FALLBACK_IDLE_MS = 2000;
export const FALLBACK_BACKOFF_MS = 15000;
const FAST_TICKS = 30;

export type FallbackPoll = {
  wake(): void;
  backoff(): void;
  running(): boolean;
  dispose(): void;
};

export function installFallbackPoll(tryRender: () => void, mounted: () => boolean): FallbackPoll {
  let timer = 0;
  let period = 0;
  let fastTicks = FAST_TICKS;
  let allowed = false;
  let started = false;

  const stop = (): void => {
    if (!timer) return;
    clearInterval(timer);
    timer = 0; period = 0;
    timerDisposed();
  };
  const arm = (ms: number): void => {
    stop();
    period = ms;
    timer = setInterval(tick, ms) as unknown as number;
    timerCreated();
  };
  const tick = (): void => {
    tryRender();
    if (mounted()) { stop(); return; }
    if (period === FALLBACK_FAST_MS && --fastTicks <= 0) arm(FALLBACK_IDLE_MS);
  };
  const start = (fast: boolean): void => {
    fastTicks = FAST_TICKS;
    arm(fast ? FALLBACK_FAST_MS : FALLBACK_IDLE_MS);
  };

  const unregister = registerPeriodic("homePatchFallback", {
    runIn: ["active"],
    // Only the first start gets the fast phase: a return from a game or
    // another page resumes at the idle cadence (a bridge-owned Home never mounts here).
    start: () => { allowed = true; tryRender(); if (!timer && !mounted()) start(!started); started = true; },
    stop: () => { allowed = false; stop(); },
  });

  return {
    wake: () => { if (allowed) start(true); },
    backoff: () => { if (allowed) arm(FALLBACK_BACKOFF_MS); },
    running: () => timer !== 0,
    dispose: () => { unregister(); stop(); },
  };
}
