import { useEffect } from "react";

/* Hero zoom only while the Home is being used: Steam's own hero does not
   animate on an idle Home, and a continuous screen-wide scale costs ~3 pp of a
   core per fps. After HERO_IDLE_MS without any input the mount gets `ds-idle`
   (CSS pauses the zoom); the next input lifts it. One timer, re-armed per
   input, no polling. */
export const HERO_IDLE_MS = 60_000;
export const HERO_IDLE_CLASS = "ds-idle";
const INPUT_EVENTS = ["vgp_ondirection", "vgp_onok", "vgp_onmenubutton", "keydown", "pointerdown", "pointermove", "wheel"];
// Pointer-move storms would otherwise re-arm the timer on every event.
const REARM_MIN_GAP_MS = 1000;

export function useHeroIdlePause(mountEl: HTMLElement | null): void {
  useEffect(() => {
    if (!mountEl) return;
    const doc = mountEl.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    let timer: number | null = null;
    let lastArm = 0;
    const arm = () => {
      timer = win.setTimeout(() => {
        timer = null;
        mountEl.classList.add(HERO_IDLE_CLASS);
        if (__DEV__) { try { (globalThis as any).__ds_hero_idle = true; } catch {} }
      }, HERO_IDLE_MS);
    };
    const onInput = () => {
      const now = Date.now();
      if (timer != null && now - lastArm < REARM_MIN_GAP_MS) return;
      lastArm = now;
      if (timer != null) win.clearTimeout(timer);
      if (mountEl.classList.contains(HERO_IDLE_CLASS)) {
        mountEl.classList.remove(HERO_IDLE_CLASS);
        if (__DEV__) { try { (globalThis as any).__ds_hero_idle = false; } catch {} }
      }
      arm();
    };
    for (const ev of INPUT_EVENTS) doc.addEventListener(ev, onInput, { capture: true, passive: true });
    lastArm = Date.now();
    arm();
    return () => {
      for (const ev of INPUT_EVENTS) doc.removeEventListener(ev, onInput, true);
      if (timer != null) win.clearTimeout(timer);
      mountEl.classList.remove(HERO_IDLE_CLASS);
    };
  }, [mountEl]);
}
