// The family comes from hardware identity, never the CPU architecture; unknown capabilities stay null so rules fail open.
export type DeviceFamily = "deck" | "frame" | "machine" | "pc" | "handheld" | "unknown";
export type Architecture = "x86_64" | "aarch64" | "unknown";

type DeviceCapabilities = {
  battery: boolean | null;
  externalDisplay: boolean | null;
  vr: boolean | null;
  controller: boolean | null;
};

export type DeviceProfile = {
  family: DeviceFamily;
  architecture: Architecture;
  model: string | null;
  capabilities: DeviceCapabilities;
};

export type DeviceKindLike = "deck" | "machine" | "frame" | "desktop" | "handheld-arm" | "unknown";

const FAMILY_BY_KIND: Record<DeviceKindLike, DeviceFamily> = {
  deck: "deck", frame: "frame", machine: "machine", desktop: "pc", "handheld-arm": "handheld", unknown: "unknown",
};

export function familyFromKind(kind: DeviceKindLike | string | null | undefined): DeviceFamily {
  return FAMILY_BY_KIND[(kind ?? "unknown") as DeviceKindLike] ?? "unknown";
}

export function classifyArchitecture(arch: string | null | undefined): Architecture {
  const a = (arch ?? "").toLowerCase();
  if (a === "x86_64" || a === "amd64" || a === "x64") return "x86_64";
  if (a === "aarch64" || a === "arm64") return "aarch64";
  return "unknown";
}

function vrCapability(family: DeviceFamily, xr: boolean | null | undefined): boolean | null {
  if (xr === true) return true;
  return family === "frame" ? true : family === "unknown" ? null : false;
}

export function deriveDeviceProfile(
  identity: { device: DeviceKindLike | string; arch: string | null; model: string | null },
  state: { hasBattery: boolean | null; external: boolean | null; controllerConnected: boolean | null; xr?: boolean | null },
): DeviceProfile {
  const family = familyFromKind(identity.device);
  return {
    family,
    architecture: classifyArchitecture(identity.arch),
    model: identity.model ?? null,
    capabilities: {
      battery: family === "deck" || family === "handheld" ? true : family === "machine" || family === "pc" ? false : state.hasBattery,
      externalDisplay: state.external,
      vr: vrCapability(family, state.xr),
      controller: state.controllerConnected,
    },
  };
}

export function compatCategoryForFamily(family: DeviceFamily, meta: { deckCompatCategory?: number; machineCompatCategory?: number; frameCompatCategory?: number }): number | undefined {
  if (family === "frame") return meta.frameCompatCategory ?? meta.deckCompatCategory;
  if (family === "machine") return meta.machineCompatCategory ?? meta.deckCompatCategory;
  return meta.deckCompatCategory;
}
