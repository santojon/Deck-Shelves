import type { HostHandshake } from "./contract";

/* Cooperative plugin auto-update, plugin half. In cooperative mode (a loader
   launched this copy, the neutral host owns) the host may run its OWN, newer
   copy of the bundle: when its handshake advertises `coopBundle` and a bundle
   at least as new, this loader copy stands down (publishes the defer global the
   host reads, boots only if no host bundle shows up). Off unless the host opts in. */
export const DEFER_GLOBAL = "__DECK_SHELVES_DEFER_TO_HOST__";
export const HOST_BUNDLE_BOOTED_GLOBAL = "__DECK_SHELVES_HOST_BUNDLE_BOOTED__";
export const DEFER_FALLBACK_MS = 20000;

export type DeferSignal = { loaderVersion: string; hostBundleVersion: string; at: number };

function parseVersion(v: string): number[] {
  return String(v).trim().replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
}

// >0 when a is newer, 0 when equal, <0 when older (numeric major.minor.patch).
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a), pb = parseVersion(b);
  for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; }
  return 0;
}

export function shouldDeferToHost(opts: { forced: boolean; handshake: HostHandshake | null | undefined; ownVersion: string }): boolean {
  const hs = opts.handshake;
  if (!opts.forced || !hs || hs.capabilities?.coopBundle !== true) return false;
  const hostBundle = hs.bundleVersion;
  if (!hostBundle) return false;
  return compareVersions(hostBundle, opts.ownVersion) >= 0;
}

function scope(): any {
  const g = globalThis as any;
  return g.window ?? g;
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

/* Boot-time decision. A copy not launched by a loader IS the host's bundle and
   only announces itself. A loader copy defers at most once per session: it
   publishes the signal and, if the host bundle never boots within the fallback
   window, clears it and runs `onFallback` (the normal boot). Returns true when
   the caller must hand the loader a placeholder instead of booting. */
export function tryDeferToHost(opts: {
  loaderLaunched: boolean; forced: boolean; handshake: HostHandshake | null | undefined;
  ownVersion: string; onFallback: () => void; log?: (msg: string) => void;
}): boolean {
  if (!opts.loaderLaunched) { markHostBundleBooted(opts.ownVersion); return false; }
  if (deferred || !shouldDeferToHost(opts)) return false;
  deferred = true;
  const hostBundleVersion = String(opts.handshake?.bundleVersion ?? "");
  publishDeferSignal({ loaderVersion: opts.ownVersion, hostBundleVersion, at: Date.now() });
  opts.log?.(`cooperative auto-update — standing down for the host bundle ${hostBundleVersion} (this copy is ${opts.ownVersion})`);
  setTimeout(() => {
    if (hostBundleBooted()) return;
    clearDeferSignal();
    opts.log?.("host bundle never booted within the fallback window — booting this copy");
    opts.onFallback();
  }, DEFER_FALLBACK_MS);
  return true;
}
