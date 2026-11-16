import {
  COOP_DEFER_GLOBAL, COOP_HOST_BUNDLE_BOOTED_GLOBAL, COOP_OFFER_KEY as CONTRACT_OFFER_KEY,
  compareVersions, shouldDeferToHost, type CoopDeferSignal, type CoopOffer, type HostHandshake,
} from "./contract";

export const DEFER_GLOBAL = COOP_DEFER_GLOBAL;
export const HOST_BUNDLE_BOOTED_GLOBAL = COOP_HOST_BUNDLE_BOOTED_GLOBAL;
export const DEFER_FALLBACK_MS = 20000;
// On a cold start this copy boots before the host's handshake exists, so the stored offer decides.
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

export function markCoopOfferFallback(): void {
  const offer = readCoopOffer();
  if (!offer) return;
  try { storage()?.setItem(COOP_OFFER_KEY, JSON.stringify({ ...offer, fallbackAt: Date.now() })); } catch {}
}

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

function offeredVersion(live: boolean, handshake: HostHandshake | null | undefined, offer: CoopOffer | null): string {
  return live ? String(handshake?.bundleVersion ?? "") : String(offer?.bundleVersion);
}

function armFallbackBoot(opts: DeferOptions, offer: CoopOffer | null): void {
  setTimeout(() => {
    if (hostBundleBooted()) return;
    clearDeferSignal();
    if (offer) markCoopOfferFallback();
    opts.log?.("host bundle never booted within the fallback window — booting this copy");
    opts.onFallback();
  }, offer ? OFFER_FALLBACK_MS : DEFER_FALLBACK_MS);
}

export function tryDeferToHost(opts: DeferOptions): boolean {
  if (!opts.loaderLaunched) { markHostBundleBooted(opts.ownVersion); return false; }
  if (deferred) return false;
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
