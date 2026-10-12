import { describe, it, expect } from "vitest";
import { mergeHubConfig, mergeSettings } from "../../domain/settingsMerge";
import { defaultSettings } from "../../domain/defaults";

const cfg = (values: Record<string, unknown>, updatedAt: Record<string, number>) => ({ values, updatedAt });

describe("mergeHubConfig — a host's own config carried per key on the sync", () => {
  it("adopts the entity when only one side has it, and keeps local when the remote is empty", () => {
    const local = cfg({ auto_update: true }, { auto_update: 10 });
    expect(mergeHubConfig(null, local)).toEqual(local);
    expect(mergeHubConfig(local, null)).toEqual(local);
    expect(mergeHubConfig(local, cfg({}, {}))).toEqual(local);
  });

  it("takes each key from the newer clock, ties keep local, unknown keys are added", () => {
    const local = cfg({ auto_update: true, quiet: false, boot_movie: "a" }, { auto_update: 10, quiet: 20, boot_movie: 5 });
    const remote = cfg({ auto_update: false, quiet: true, native_qam: true }, { auto_update: 15, quiet: 20, native_qam: 1 });
    const out = mergeHubConfig(local, remote)!;
    expect(out.values).toEqual({ auto_update: false, quiet: false, boot_movie: "a", native_qam: true });
    expect(out.updatedAt).toEqual({ auto_update: 15, quiet: 20, boot_movie: 5, native_qam: 1 });
  });

  it("rides mergeSettings regardless of which scalar bag wins", () => {
    const a: any = { ...defaultSettings(), preferencesUpdatedAt: 100, hubConfig: cfg({ a: 1 }, { a: 50 }) };
    const b: any = { ...defaultSettings(), preferencesUpdatedAt: 200, hubConfig: cfg({ a: 2, b: 1 }, { a: 10, b: 60 }) };
    const ab = mergeSettings(a, b) as any;
    const ba = mergeSettings(b, a) as any;
    expect(ab.hubConfig.values).toEqual({ a: 1, b: 1 });
    expect(ba.hubConfig.values).toEqual({ a: 1, b: 1 });
    const none = mergeSettings(defaultSettings(), defaultSettings()) as any;
    expect(none.hubConfig).toBeUndefined();
  });
});
