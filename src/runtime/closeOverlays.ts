import { Navigation } from "./host/decky";
import { getPreferredSteamDocument } from "./steamHost";
import { steamTextSelectors } from "../steam/steamText";

// Holding L1 then pressing R1 can match both combos, so the first overlay to open locks out the other.
let overlayLockUntil = 0;
const OVERLAY_LOCK_MS = 600;
export function lockOverlay(): void { overlayLockUntil = Date.now() + OVERLAY_LOCK_MS; }
export function isOverlayLocked(): boolean { return Date.now() < overlayLockUntil; }

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

// Other languages match only the whole label, so a longer "close game" button is never pressed.
export function dismissButtonSelector(): string {
  return [
    ...steamTextSelectors("closeButton", "aria-label", "contains", "", "english"),
    ...steamTextSelectors("closeButton", "aria-label", "exact", "", "user"),
    '[data-testid*="close" i]',
  ].join(", ");
}

function clickOverlayDismissButtons(doc: Document, selector: string): void {
  const closers = doc.querySelectorAll<HTMLElement>(selector);
  closers.forEach((el) => {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      el.click();
    } catch {}
  });
}

// Never synthesise Escape here: in Big Picture a bare Escape opens the main menu.
export function closeAmbientOverlays(timeoutMs: number = 1200): Promise<void> {
  const doc = getPreferredSteamDocument() ?? document;
  const selector = dismissButtonSelector();
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  clickOverlayDismissButtons(doc, selector);
  return waitForOverlaysGone(timeoutMs, () => {
    try { (Navigation as any).CloseSideMenus?.(); } catch {}
    clickOverlayDismissButtons(doc, selector);
  });
}

function waitForOverlaysGone(timeoutMs: number = 600, onTick?: () => void): Promise<void> {
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
