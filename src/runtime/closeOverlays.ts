import { Navigation } from "@decky/ui";
import { getPreferredSteamDocument } from "./steamHost";

// Best-effort close of QAM, Steam main menu, side menus and any open
// context menu before triggering an overlay (search pill, sidenav).
// Modals are intentionally left alone — they own their own focus loop
// and would be surprising to dismiss from a global combo.
export function closeAmbientOverlays(): void {
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  try {
    const doc = getPreferredSteamDocument() ?? document;
    const ctx = doc.querySelector<HTMLElement>('[class*="contextMenu"], [class*="ContextMenu"]');
    if (ctx) {
      const closer = ctx.querySelector<HTMLElement>('[role="button"][aria-label*="close" i]');
      if (closer) closer.click();
    }
  } catch {}
}
