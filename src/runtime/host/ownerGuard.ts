import pkg from "../../../package.json";
import { OWNER_METADATA_GLOBAL, type HostOwnerMetadata } from "./contract";

/* Single-owner guard for a dual-host install (two hosts both delivering the
   bundle into ONE renderer): the first instance claims it via
   `window.__DECK_SHELVES_OWNER__`; the other stands down — no home patch, no
   settings writes (single-writer). `__SHELVES_FORCE_OWNER__` hands the claim
   to the non-Decky host. A single install always owns (fail-open). */

export type HostKind = "decky" | "shelveshub";

let _isOwner = true; // fail-open: until a claim decides otherwise, we own
let _kind: HostKind = "decky";

function ownerScope(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

/** Claim the renderer for this instance. Returns true when THIS instance owns it
    (proceed to patch the home + write settings), false to stand down. */
export function claimHomeOwnership(kind: HostKind): boolean {
  _kind = kind;
  try {
    const w = ownerScope();
    if (w.__SHELVES_FORCE_OWNER__ === "shelveshub") {
      w.__DECK_SHELVES_OWNER__ = "shelveshub"; // cooperative hand-over
    } else if (w.__DECK_SHELVES_OWNER__ == null) {
      w.__DECK_SHELVES_OWNER__ = kind; // first mount claims
    }
    _isOwner = w.__DECK_SHELVES_OWNER__ === kind;
    const owner = w.__DECK_SHELVES_OWNER__;
    if (owner === "decky" || owner === "shelveshub") {
      w[OWNER_METADATA_GLOBAL] = { host: owner, dsVersion: pkg.version } satisfies HostOwnerMetadata;
    }
  } catch {
    _isOwner = true;
  }
  return _isOwner;
}

/** Whether this instance owns the renderer. Gates the home patch and every
    `set_settings` write so a stood-down instance stays completely passive. */
export function isHomeOwner(): boolean {
  return _isOwner;
}

export function getOwnerKind(): HostKind {
  return _kind;
}

export function getOwnerMetadata(): HostOwnerMetadata | null {
  try {
    const value = ownerScope()[OWNER_METADATA_GLOBAL];
    return value?.host && typeof value.dsVersion === "string"
      ? { host: value.host, dsVersion: value.dsVersion }
      : null;
  } catch {
    return null;
  }
}
