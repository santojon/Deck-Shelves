import { Navigation } from "./host/decky";
import { getPreferredSteamDocument } from "./steamHost";

// Mutex between Quick Search and Side Nav: when one combo fires, the
/* other suppresses its own raw-bus trigger for a short window. Without
   this, holding L1 then quickly pressing R1 can match both L1+R1
   (search) AND L1+L1 (sidenav) because their matchers share the L1
   state. Either overlay calls `lockOverlay()` on open; the other reads
   `isOverlayLocked()` to decide whether to skip its handler. */
let overlayLockUntil = 0;
const OVERLAY_LOCK_MS = 600;
export function lockOverlay(): void { overlayLockUntil = Date.now() + OVERLAY_LOCK_MS; }
export function isOverlayLocked(): boolean { return Date.now() < overlayLockUntil; }

/* Selectors that flag the presence of an ambient overlay we want gone
   before opening our own pill / panel. Steam routes QAM / side menus
   through Navigation.CloseSideMenus(); context menus + modals own their
   own portals and need a few frames to finish unmounting. */
const OVERLAY_SELECTORS = [
  '[class*="contextMenu" i]',
  '[class*="ContextMenu" i]',
  '[class*="modalBody" i]',
  '[class*="ModalBody" i]',
  '[class*="modalOverlay" i]',
  '[class*="ModalOverlay" i]',
  '[class*="modalPosition" i]',
  '[class*="popup" i][role="dialog"]',
];

function ambientOverlayPresent(doc: Document): boolean {
  for (const sel of OVERLAY_SELECTORS) {
    try {
      const el = doc.querySelector(sel) as HTMLElement | null;
      if (el && el.offsetParent !== null) return true;
    } catch {}
  }
  return false;
}

function clickOverlayDismissButtons(doc: Document): void {
  // Most Steam modals carry a top-right close button with an aria-label
  // that includes "close" or a translation thereof. We also pick up
  // generic [data-testid*="close" i] used by some surfaces.
  const closers = doc.querySelectorAll<HTMLElement>(
    '[aria-label*="close" i], [aria-label*="cancel" i], [data-testid*="close" i]',
  );
  closers.forEach((el) => {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      el.click();
    } catch {}
  });
}

/* Best-effort close of QAM, Steam main menu, side menus, context menus
   and most modal portals. Returns a Promise that resolves after the
   overlays have finished unmounting (polls up to timeoutMs).

   Important: do NOT synthesise an Escape key here — Steam's gamepad */
/* layer interprets a bare Escape in BP as "open main menu", which is
   the opposite of what we want when opening Quick Search / Side Nav.
   Dismissing via Navigation.CloseSideMenus + clicking visible close
   buttons covers QAM, Steam main menu, side menus and most context
   menus without that side effect. */
export function closeAmbientOverlays(timeoutMs: number = 1200): Promise<void> {
  const doc = getPreferredSteamDocument() ?? document;
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  clickOverlayDismissButtons(doc);
  return waitForOverlaysGone(timeoutMs, () => {
    try { (Navigation as any).CloseSideMenus?.(); } catch {}
    clickOverlayDismissButtons(doc);
  });
}

export function waitForOverlaysGone(timeoutMs: number = 600, onTick?: () => void): Promise<void> {
  return new Promise((resolve) => {
    const doc = getPreferredSteamDocument() ?? document;
    const started = Date.now();
    let ticks = 0;
    const tick = () => {
      if (!ambientOverlayPresent(doc)) { resolve(); return; }
      if (Date.now() - started >= timeoutMs) { resolve(); return; }
      ticks++;
      if (onTick && ticks % 2 === 0) { try { onTick(); } catch {} }
      try { (globalThis as any).setTimeout?.(tick, 40); } catch { resolve(); }
    };
    tick();
  });
}
