/* Cached copy of the host's optional `handshake()` result — read once at
   boot (see index.tsx, right after resolveHost()) and shared read-only from
   here so diagnostics/bug-report avoid a direct HostApi import (circular
   through the settings UI tree). null on a host without handshake(). */
import type { HostHandshake } from "./host/contract";

let _handshake: HostHandshake | null = null;

export function setHostHandshake(h: HostHandshake | null): void {
  _handshake = h;
}

export function getHostHandshake(): HostHandshake | null {
  return _handshake;
}
