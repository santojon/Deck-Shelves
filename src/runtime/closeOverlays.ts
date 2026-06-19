import { Navigation } from "@decky/ui";
import { getPreferredSteamDocument } from "./steamHost";

// Selectors that flag the presence of an ambient overlay we'd want gone
// before opening our own pill / panel. Steam routes QAM / side menus
// through Navigation.CloseSideMenus(); context menus + modals own their
// own portals and need a few frames to finish unmounting.
const OVERLAY_SELECTORS = [
  '[class*="contextMenu" i]',
  '[class*="ContextMenu" i]',
  '[class*="modalBody" i]',
  '[class*="ModalBody" i]',
  '[class*="modalOverlay" i]',
  '[class*="ModalOverlay" i]',
];

function ambientOverlayPresent(doc: Document): boolean {
  for (const sel of OVERLAY_SELECTORS) {
    try { if (doc.querySelector(sel)) return true; } catch {}
  }
  return false;
}

// Best-effort close of QAM, Steam main menu, side menus and any open
// context menu. Returns a Promise that resolves after the overlays have
// finished unmounting (polls up to ~600 ms). Callers that need to grab
// focus right after should `await` this to avoid landing focus on the
// ambient overlay's last focusable.
export function closeAmbientOverlays(): Promise<void> {
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  try {
    const doc = getPreferredSteamDocument() ?? document;
    const ctx = doc.querySelector<HTMLElement>('[class*="contextMenu"], [class*="ContextMenu"]');
    if (ctx) {
      const closer = ctx.querySelector<HTMLElement>('[role="button"][aria-label*="close" i]');
      if (closer) closer.click();
    }
  } catch {}
  return waitForOverlaysGone(600);
}

export function waitForOverlaysGone(timeoutMs: number = 600): Promise<void> {
  return new Promise((resolve) => {
    const doc = getPreferredSteamDocument() ?? document;
    const started = Date.now();
    const tick = () => {
      if (!ambientOverlayPresent(doc)) { resolve(); return; }
      if (Date.now() - started >= timeoutMs) { resolve(); return; }
      try { (globalThis as any).setTimeout?.(tick, 40); } catch { resolve(); }
    };
    tick();
  });
}
