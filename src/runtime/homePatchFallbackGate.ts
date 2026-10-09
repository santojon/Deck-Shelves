/* Pure decision for homePatch's DOM fallback: how long to keep waiting for the
   router-hook bridge before mounting its own HomeShelves. One grace window
   after install; once the bridge has proven it fills the root, a grace window
   on EVERY Home entry too (live: without it the fallback won the mount race on
   each return and double-rendered). A bridge that never fills is unchanged. */
export type BridgeGateState = {
  bridgeRegistered: boolean;
  installedAt: number;
  bridgeFilledOnce: boolean;
  // A Home entry = href is /library/home AND the root holds no shelf panel yet
  // (absent, or created but empty while the bridge commits). The fallback's own
  // visibility heuristic matches detail pages too. Cleared once a panel exists.
  entryPending: boolean;
  entryAt: number;
  // Dev-only diagnostics: what the last tick saw.
  lastHref?: string;
  lastRootFilled?: boolean;
};

// How long a registered bridge gets to render before the DOM fallback steps in.
export const BRIDGE_FALLBACK_GRACE_MS = 8000;
// Per-entry grace once the bridge has filled the root at least once.
export const BRIDGE_ENTRY_GRACE_MS = 6000;
// Per-entry grace for a bridge that hasn't proven itself yet (cold boot: Home
// often first appears after the install window already ran out). Short, so a
// sole host — whose bridge never fills — pays it at most once, briefly.
export const BRIDGE_UNPROVEN_ENTRY_GRACE_MS = 3000;

export function createBridgeGateState(now: number): BridgeGateState {
  const s: BridgeGateState = { bridgeRegistered: false, installedAt: now, bridgeFilledOnce: false, entryPending: false, entryAt: now };
  if (__DEV__) { try { (globalThis as any).__ds_fallback_gate = s; } catch {} }
  return s;
}

// Call on every fallback tick with the current facts. `bridgeFilled` is the
// bridge's own "my portal attached and revealed shelves" signal — the only
// trustworthy proof (a panel in the root could be the fallback's own).
export function noteFallbackTick(s: BridgeGateState, hrefIsHome: boolean, rootFilled: boolean, now: number, bridgeFilled: boolean): void {
  if (bridgeFilled) s.bridgeFilledOnce = true;
  if (rootFilled) { s.entryPending = false; return; }
  if (hrefIsHome && !s.entryPending) { s.entryPending = true; s.entryAt = now; }
}

export function bridgeGraceActive(s: BridgeGateState, now: number): boolean {
  if (!s.bridgeRegistered) return false;
  if (s.bridgeFilledOnce) return s.entryPending && now - s.entryAt < BRIDGE_ENTRY_GRACE_MS;
  if (s.entryPending && now - s.entryAt < BRIDGE_UNPROVEN_ENTRY_GRACE_MS) return true;
  return now - s.installedAt < BRIDGE_FALLBACK_GRACE_MS;
}

// Lower-cased path+hash of a window, tolerant of a missing/foreign window.
export function hrefOf(win: Window | null | undefined): string {
  try { return `${win?.location?.pathname ?? ""}${win?.location?.hash ?? ""}`.toLowerCase(); } catch { return ""; }
}
