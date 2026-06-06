/**
 * Single shared overlay detector for all cards. Replaces the per-card
 * body MutationObserver + focusin/focusout listeners — at home scale
 * (30+ visible cards) the duplicated observers were the dominant
 * idle-CPU cost on the home.
 *
 * One MutationObserver on body + focus listeners updates the shared
 * `active` flag. Subscribers fire only on transitions.
 */

import { getPreferredSteamDocument } from "../../runtime/steamHost";

type Listener = (active: boolean) => void;

let active = false;
const listeners = new Set<Listener>();
let setupDoc: Document | null = null;
let cleanup: (() => void) | null = null;

function detect(doc: Document, win: Window): boolean {
  try {
    const homeRoot = doc.getElementById("deck-shelves-home-root");
    if (!homeRoot) return false;
    const cx = win.innerWidth / 2;
    const cy = win.innerHeight / 2;
    const top = doc.elementFromPoint(cx, cy);
    if (!top) return false;
    return !homeRoot.contains(top);
  } catch {
    return false;
  }
}

function ensureWatcher(doc: Document): void {
  if (setupDoc === doc && cleanup) return;
  // Re-setup if the doc changed (e.g. Steam UI reload).
  try { cleanup?.(); } catch {}
  setupDoc = doc;
  const win = doc.defaultView ?? window;
  const recheck = () => {
    const next = detect(doc, win);
    if (next === active) return;
    active = next;
    for (const l of listeners) {
      try { l(active); } catch {}
    }
  };
  const obs = new MutationObserver(recheck);
  obs.observe(doc.body, { childList: true });
  doc.addEventListener("focusin", recheck, true);
  doc.addEventListener("focusout", recheck, true);
  win.addEventListener("focusin", recheck, true);
  win.addEventListener("focusout", recheck, true);
  // Initial state.
  active = detect(doc, win);
  cleanup = () => {
    obs.disconnect();
    doc.removeEventListener("focusin", recheck, true);
    doc.removeEventListener("focusout", recheck, true);
    win.removeEventListener("focusin", recheck, true);
    win.removeEventListener("focusout", recheck, true);
  };
}

export function subscribeOverlayActive(doc: Document, listener: Listener): () => void {
  ensureWatcher(doc);
  listeners.add(listener);
  // Fire once so the subscriber syncs with current state.
  try { listener(active); } catch {}
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      try { cleanup?.(); } catch {}
      cleanup = null;
      setupDoc = null;
    }
  };
}

export function getOverlayActive(doc?: Document): boolean {
  const d = doc ?? getPreferredSteamDocument() ?? document;
  ensureWatcher(d);
  return active;
}
