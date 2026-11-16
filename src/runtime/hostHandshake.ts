// Kept apart from the host API so readers don't pull in a circular import.
import type { HostHandshake } from "./host/contract";

let _handshake: HostHandshake | null = null;

export function setHostHandshake(h: HostHandshake | null): void {
  _handshake = h;
}

export function getHostHandshake(): HostHandshake | null {
  return _handshake;
}
