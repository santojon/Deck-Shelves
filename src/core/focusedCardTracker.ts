
import { getAllSteamDocuments, getPreferredSteamDocument } from "../runtime/steamHost";

export type FocusedCardInfo = {
  appid: number;
  shelfId: string | null;
};

let current: FocusedCardInfo | null = null;
const listeners = new Set<(info: FocusedCardInfo | null) => void>();
let installed = false;
let installRetryTimer: ReturnType<typeof setTimeout> | null = null;
let teardowns: Array<() => void> = [];

function notify(): void {
  for (const cb of listeners) {
    try { cb(current); } catch {}
  }
}

function readFromCard(card: HTMLElement | null): FocusedCardInfo | null {
  if (!card) return null;
  const appidRaw = card.getAttribute("data-appid");
  const appid = appidRaw ? Number(appidRaw) : NaN;
  if (!Number.isFinite(appid) || appid <= 0) return null;
  return { appid, shelfId: card.getAttribute("data-shelfid") || null };
}

function sameInfo(a: FocusedCardInfo | null, b: FocusedCardInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.appid === b.appid && a.shelfId === b.shelfId;
}

function setCurrent(next: FocusedCardInfo | null): void {
  if (sameInfo(current, next)) return;
  current = next;
  notify();
}

function findHomeRoot(): { doc: Document; root: HTMLElement } | null {
  const docs = [getPreferredSteamDocument(), ...getAllSteamDocuments()];
  for (const d of docs) {
    try {
      const root = d?.getElementById?.("deck-shelves-home-root");
      if (root) return { doc: d, root };
    } catch {}
  }
  return null;
}

function attach(): boolean {
  const located = findHomeRoot();
  if (!located) return false;
  const { root } = located;
  const onFocusIn = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    const card = t?.closest?.(".ds-card") as HTMLElement | null;
    if (card) setCurrent(readFromCard(card));
  };
  const onFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (!next || !root.contains(next)) setCurrent(null);
  };
  root.addEventListener("focusin", onFocusIn, true);
  root.addEventListener("focusout", onFocusOut, true);
  teardowns.push(() => root.removeEventListener("focusin", onFocusIn, true));
  teardowns.push(() => root.removeEventListener("focusout", onFocusOut, true));
  // Seed with whatever is currently focused.
  const seed = root.querySelector(".ds-card.gpfocus, .ds-card:focus") as HTMLElement | null;
  setCurrent(readFromCard(seed));
  return true;
}

function ensureInstalled(): void {
  if (installed) return;
  if (attach()) {
    installed = true;
    return;
  }
  // Home root not in DOM yet — retry until it appears.
  if (installRetryTimer === null) {
    installRetryTimer = setTimeout(() => { installRetryTimer = null; ensureInstalled(); }, 200);
  }
}

export function getFocusedCard(): FocusedCardInfo | null {
  ensureInstalled();
  return current;
}

export function subscribeFocusedCard(cb: (info: FocusedCardInfo | null) => void): () => void {
  ensureInstalled();
  listeners.add(cb);
  // Immediate fire so the subscriber gets the current state.
  try { cb(current); } catch {}
  return () => { listeners.delete(cb); };
}

export function uninstallFocusedCardTracker(): void {
  for (const fn of teardowns) { try { fn(); } catch {} }
  teardowns = [];
  installed = false;
  if (installRetryTimer !== null) { clearTimeout(installRetryTimer); installRetryTimer = null; }
  listeners.clear();
  current = null;
}
