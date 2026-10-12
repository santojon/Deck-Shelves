import { describe, it, expect } from "vitest";
import { deriveDeviceProfile, familyFromKind, classifyArchitecture, compatCategoryForFamily } from "../../domain/deviceProfile";
import { DEVICE_FIXTURES } from "../fixtures/devices";

describe("deviceProfile — family never inferred from architecture", () => {
  it("maps the detected kind to a family and the CPU string to an architecture independently", () => {
    const frame = deriveDeviceProfile(DEVICE_FIXTURES.frameArm.identity, DEVICE_FIXTURES.frameArm.state);
    expect(frame.family).toBe("frame");
    expect(frame.architecture).toBe("aarch64");
    expect(frame.capabilities.vr).toBe(true);
    const desktopArm = deriveDeviceProfile(DEVICE_FIXTURES.desktopArm.identity, DEVICE_FIXTURES.desktopArm.state);
    expect(desktopArm.family).toBe("pc");
    expect(desktopArm.architecture).toBe("aarch64");
    expect(desktopArm.capabilities.vr).toBe(false);
    const unknownArm = deriveDeviceProfile(DEVICE_FIXTURES.unknownArm.identity, DEVICE_FIXTURES.unknownArm.state);
    expect(unknownArm.family).toBe("unknown");
    expect(unknownArm.capabilities).toEqual({ battery: null, externalDisplay: null, vr: null, controller: null });
  });

  it("treats a host-reported XR session as VR-capable on any family, and never removes VR from a Frame", () => {
    const pc = { device: "desktop", arch: "x86_64", model: null };
    const live = { hasBattery: null, external: null, controllerConnected: null };
    expect(deriveDeviceProfile(pc, live).capabilities.vr).toBe(false);
    expect(deriveDeviceProfile(pc, { ...live, xr: true }).capabilities.vr).toBe(true);
    expect(deriveDeviceProfile(pc, { ...live, xr: false }).capabilities.vr).toBe(false);
    expect(deriveDeviceProfile(DEVICE_FIXTURES.frameArm.identity, { ...DEVICE_FIXTURES.frameArm.state, xr: false }).capabilities.vr).toBe(true);
    expect(deriveDeviceProfile({ device: "unknown", arch: null, model: null }, { ...live, xr: null }).capabilities.vr).toBeNull();
  });

  it("knows which families carry a battery and which don't, and leaves the rest to the live signal", () => {
    expect(deriveDeviceProfile(DEVICE_FIXTURES.deckLcd.identity, DEVICE_FIXTURES.deckLcd.state).capabilities.battery).toBe(true);
    expect(deriveDeviceProfile(DEVICE_FIXTURES.machineX86.identity, DEVICE_FIXTURES.machineX86.state).capabilities.battery).toBe(false);
    expect(deriveDeviceProfile({ device: "deck", arch: null, model: null }, { hasBattery: null, external: null, controllerConnected: null }).capabilities.battery).toBe(true);
  });

  it("classifies architectures and kinds, unknown-safe", () => {
    expect(classifyArchitecture("x86_64")).toBe("x86_64");
    expect(classifyArchitecture("amd64")).toBe("x86_64");
    expect(classifyArchitecture("arm64")).toBe("aarch64");
    expect(classifyArchitecture(null)).toBe("unknown");
    expect(familyFromKind("handheld-arm")).toBe("handheld");
    expect(familyFromKind("something-new")).toBe("unknown");
  });

  it("badges the compat rating of the device in use, falling back to the Deck rating", () => {
    const meta = { deckCompatCategory: 3, machineCompatCategory: 2, frameCompatCategory: 1 };
    expect(compatCategoryForFamily("frame", meta)).toBe(1);
    expect(compatCategoryForFamily("machine", meta)).toBe(2);
    expect(compatCategoryForFamily("deck", meta)).toBe(3);
    expect(compatCategoryForFamily("pc", meta)).toBe(3);
    expect(compatCategoryForFamily("frame", { deckCompatCategory: 3 })).toBe(3);
  });
});
