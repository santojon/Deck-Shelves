import {
  COOP_DEFER_GLOBAL, COOP_HOST_BUNDLE_BOOTED_GLOBAL, COOP_OFFER_KEY as CONTRACT_OFFER_KEY,
  compareVersions, shouldDeferToHost, type CoopDeferSignal, type CoopOffer, type HostHandshake,
} from "./contract";

/* Cooperative plugin auto-update, plugin half. In cooperative mode (a loader
   launched this copy, the neutral host owns) the host may run its OWN, newer
   copy of the bundle: when its handshake advertises `coopBundle` and a bundle
   at least as new, this loader copy stands down (publishes the defer global the
   host reads, boots only if no host bundle shows up). Off unless the host opts in. */
// The protocol (global names, offer key, shapes, the version rule) is the host
// contract's; this module is the boot policy around it.
export const DEFER_GLOBAL = COOP_DEFER_GLOBAL;
export const HOST_BUNDLE_BOOTED_GLOBAL = COOP_HOST_BUNDLE_BOOTED_GLOBAL;
export const DEFER_FALLBACK_MS = 20000;
/* The host's standing offer, kept in the renderer's storage: at a cold Steam start
   the loader boots this copy long before the host's first injection tick, so the
   live handshake is not there yet — the offer is what this copy stands down on.
   A fallback boot stamps it, and the host withholds the offer for a while. */
export const COOP_OFFER_KEY = CONTRACT_OFFER_KEY;
export const OFFER_FALLBACK_MS = 60000;

export type DeferSignal = CoopDeferSignal;
export type { CoopOffer };
export { compareVersions, shouldDeferToHost };

function scope(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

function storage(): Storage | null {
  try { return scope().localStorage ?? null; } catch { return null; }
}

export function readCoopOffer(): CoopOffer | null {
  try {
    const raw = storage()?.getItem(COOP_OFFER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.bundleVersion === "string" ? v as CoopOffer : null;
  } catch { return null; }
}

// A fallback boot stamps the offer, so the host sees it and withholds the offer for a while.
export function markCoopOfferFallback(): void {
  const offer = readCoopOffer();
  if (!offer) return;
  try { storage()?.setItem(COOP_OFFER_KEY, JSON.stringify({ ...offer, fallbackAt: Date.now() })); } catch {}
}

// The host's offer when it applies to this copy: a bundle at least as new, not answered by a fallback.
function standingOffer(ownVersion: string): CoopOffer | null {
  const offer = readCoopOffer();
  if (!offer || offer.fallbackAt) return null;
  return compareVersions(offer.bundleVersion, ownVersion) >= 0 ? offer : null;
}

export function publishDeferSignal(signal: DeferSignal): void {
  try { scope()[DEFER_GLOBAL] = signal; } catch {}
}

export function clearDeferSignal(): void {
  try { delete scope()[DEFER_GLOBAL]; } catch {}
}

export function readDeferSignal(): DeferSignal | null {
  try { const v = scope()[DEFER_GLOBAL]; return v && typeof v === "object" ? v as DeferSignal : null; } catch { return null; }
}

// Set by the copy that boots as the host's own bundle, so a deferring loader copy knows it arrived.
export function markHostBundleBooted(version: string): void {
  try { scope()[HOST_BUNDLE_BOOTED_GLOBAL] = version; } catch {}
}

export function hostBundleBooted(): boolean {
  try { return typeof scope()[HOST_BUNDLE_BOOTED_GLOBAL] === "string"; } catch { return false; }
}

let deferred = false;

type DeferOptions = {
  loaderLaunched: boolean; forced: boolean; handshake: HostHandshake | null | undefined;
  ownVersion: string; onFallback: () => void; log?: (msg: string) => void;
};

// The bundle version this copy stands down for: the live handshake's, else the stored offer's.
function offeredVersion(live: boolean, handshake: HostHandshake | null | undefined, offer: CoopOffer | null): string {
  return live ? String(handshake?.bundleVersion ?? "") : String(offer?.bundleVersion);
}

/* If the host bundle never boots within the window, clear the signal (stamping a
   stored offer so the host withholds it for a while) and run the normal boot. */
function armFallbackBoot(opts: DeferOptions, offer: CoopOffer | null): void {
  setTimeout(() => {
    if (hostBundleBooted()) return;
    clearDeferSignal();
    if (offer) markCoopOfferFallback();
    opts.log?.("host bundle never booted within the fallback window — booting this copy");
    opts.onFallback();
  }, offer ? OFFER_FALLBACK_MS : DEFER_FALLBACK_MS);
}

/* Boot-time decision. A copy not launched by a loader IS the host's bundle and
   only announces itself. A loader copy defers at most once per session: it
   publishes the signal and, if the host bundle never boots within the fallback
   window, clears it and runs `onFallback` (the normal boot). Returns true when
   the caller must hand the loader a placeholder instead of booting. */
export function tryDeferToHost(opts: DeferOptions): boolean {
  if (!opts.loaderLaunched) { markHostBundleBooted(opts.ownVersion); return false; }
  if (deferred) return false;
  // The host's copy already runs in this renderer (this copy was reloaded): never a second one.
  if (hostBundleBooted()) {
    deferred = true;
    opts.log?.("cooperative auto-update — the host's copy is running, this copy stands down");
    return true;
  }
  const live = shouldDeferToHost(opts);
  const offer = live || opts.handshake ? null : standingOffer(opts.ownVersion);
  if (!live && !offer) { clearDeferSignal(); return false; }
  deferred = true;
  const hostBundleVersion = offeredVersion(live, opts.handshake, offer);
  publishDeferSignal({ loaderVersion: opts.ownVersion, hostBundleVersion, at: Date.now() });
  opts.log?.(`cooperative auto-update — standing down for the host bundle ${hostBundleVersion} (this copy is ${opts.ownVersion})`);
  armFallbackBoot(opts, offer);
  return true;
}
