import { useEffect, useRef, useState } from "react";
import { removeOwnMounts } from "./mountUtils";

let lastClaimedMount: HTMLElement | null = null;
let lastClaimAt = 0;
export function claimMount(el: HTMLElement): void {
  const now = Date.now();
  if (el === lastClaimedMount && now - lastClaimAt < 1000) return;
  lastClaimedMount = el; lastClaimAt = now;
  try { el.dataset.dsClaimedAt = String(now); } catch {}
}

let homeInstanceSeq = 0;
const liveHomeInstances = new Map<number, boolean>();
const homeInstanceListeners = new Set<() => void>();
let bridgeFilled = false;
export function bridgeHasFilledHome(): boolean { return bridgeFilled; }
export function markBridgeFilled(): void {
  if (bridgeFilled) return;
  bridgeFilled = true;
  notifyHomeInstances();
}
function shouldRenderInstance(id: number, isFallback: boolean): boolean {
  let latestBridge = 0;
  for (const [other, fb] of liveHomeInstances) if (!fb && other > latestBridge) latestBridge = other;
  if (!isFallback) return id === latestBridge;
  return latestBridge === 0 || !bridgeFilled;
}
function notifyHomeInstances(): void {
  for (const l of homeInstanceListeners) { try { l(); } catch {} }
}
export function removeSharedMountIfLast(docs: Iterable<Document>): void {
  if (liveHomeInstances.size !== 0) return;
  removeOwnMounts(docs);
}
export function useHomeInstanceRegistry(isFallback: boolean): boolean {
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = ++homeInstanceSeq;
  const [shouldRender, setShouldRender] = useState(true);
  useEffect(() => {
    const id = idRef.current;
    liveHomeInstances.set(id, isFallback);
    const sync = () => setShouldRender(shouldRenderInstance(id, isFallback));
    homeInstanceListeners.add(sync);
    notifyHomeInstances();
    return () => {
      liveHomeInstances.delete(id);
      homeInstanceListeners.delete(sync);
      notifyHomeInstances();
    };
  }, [isFallback]);
  return shouldRender;
}
