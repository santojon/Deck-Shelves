import pkg from "../../../package.json";
import { OWNER_METADATA_GLOBAL, type HostOwnerMetadata } from "./contract";

export type HostKind = "decky" | "shelveshub";

let _isOwner = true;
let _kind: HostKind = "decky";

function ownerScope(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

export function claimHomeOwnership(kind: HostKind): boolean {
  _kind = kind;
  try {
    const w = ownerScope();
    if (w.__SHELVES_FORCE_OWNER__ === "shelveshub") {
      w.__DECK_SHELVES_OWNER__ = "shelveshub";
    } else if (w.__DECK_SHELVES_OWNER__ == null) {
      w.__DECK_SHELVES_OWNER__ = kind;
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
