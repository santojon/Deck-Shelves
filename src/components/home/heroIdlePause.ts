import { useEffect } from "react";

// A continuous screen-wide zoom is costly, so it only runs while the Home is in use.
const HERO_IDLE_MS = 60_000;
const HERO_IDLE_CLASS = "ds-idle";
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
      }, HERO_IDLE_MS);
    };
    const onInput = () => {
      const now = Date.now();
      if (timer != null && now - lastArm < REARM_MIN_GAP_MS) return;
      lastArm = now;
      if (timer != null) win.clearTimeout(timer);
      if (mountEl.classList.contains(HERO_IDLE_CLASS)) {
        mountEl.classList.remove(HERO_IDLE_CLASS);
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
