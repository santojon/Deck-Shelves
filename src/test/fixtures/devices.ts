/* Fake device fixtures for Frame / Machine / Deck logic — the identities the
   backend probe + host handshake would report, so the family model and the
   compat-badge selection can be tested without the hardware. */
export const DEVICE_FIXTURES = {
  deckLcd: { identity: { device: "deck", arch: "x86_64", model: "Jupiter" }, state: { hasBattery: true, external: false, controllerConnected: false } },
  frameArm: { identity: { device: "frame", arch: "aarch64", model: "Steam Frame" }, state: { hasBattery: true, external: null, controllerConnected: true } },
  machineX86: { identity: { device: "machine", arch: "x86_64", model: "Steam Machine" }, state: { hasBattery: false, external: true, controllerConnected: true } },
  desktopArm: { identity: { device: "desktop", arch: "arm64", model: "Mac" }, state: { hasBattery: true, external: false, controllerConnected: false } },
  unknownArm: { identity: { device: "unknown", arch: "aarch64", model: null }, state: { hasBattery: null, external: null, controllerConnected: null } },
} as const;
