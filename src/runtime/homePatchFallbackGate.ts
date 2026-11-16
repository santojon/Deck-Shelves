// Without a grace window on every Home entry the fallback wins the mount race and double-renders.
export type BridgeGateState = {
  bridgeRegistered: boolean;
  installedAt: number;
  bridgeFilledOnce: boolean;
  entryPending: boolean;
  entryAt: number;
};

export const BRIDGE_FALLBACK_GRACE_MS = 8000;
export const BRIDGE_ENTRY_GRACE_MS = 6000;
export const BRIDGE_UNPROVEN_ENTRY_GRACE_MS = 3000;

export function createBridgeGateState(now: number): BridgeGateState {
  return { bridgeRegistered: false, installedAt: now, bridgeFilledOnce: false, entryPending: false, entryAt: now };
}

// `bridgeFilled` is the only trustworthy signal; a panel in the root could be the fallback's own.
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

export function hrefOf(win: Window | null | undefined): string {
  try { return `${win?.location?.pathname ?? ""}${win?.location?.hash ?? ""}`.toLowerCase(); } catch { return ""; }
}
