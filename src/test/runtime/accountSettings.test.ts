import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../domain/defaults";

const edge = vi.hoisted(() => ({
  current: null as any,
  fileRead: true,
  readListeners: new Set<() => void>(),
  saves: [] as any[],
  snapshots: [] as string[],
  held: false,
  resumed: 0,
}));

vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => edge.current,
  isSettingsFileRead: () => edge.fileRead,
  onSettingsFileRead: (fn: () => void) => { edge.readListeners.add(fn); return () => edge.readListeners.delete(fn); },
  requestSettingsFileRead: () => {},
  saveSettings: async (next: any) => { edge.saves.push(next); edge.current = next; return true; },
  snapshotOnNextSave: (kind: string) => { edge.snapshots.push(kind); },
}));
vi.mock("../../runtime/steamAccount", () => ({
  holdCloudSyncForAccount: () => { edge.held = true; },
  resumeCloudSyncForAccount: () => { edge.held = false; edge.resumed++; },
}));

const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";

async function load() {
  vi.resetModules();
  return import("../../runtime/accountSettings");
}

function ui() {
  return { ask: vi.fn(), restored: vi.fn() };
}

describe("settings per account at start", () => {
  beforeEach(() => {
    edge.current = { ...defaultSettings(), shelves: [{ id: "a1" }] };
    edge.fileRead = true; edge.readListeners.clear();
    edge.saves = []; edge.snapshots = []; edge.held = false; edge.resumed = 0;
  });

  it("the account that last used the device takes the settings already there, silently", async () => {
    const mod = await load(); const u = ui();
    await mod.createAccountSettingsHandler(u)({ key: A, previous: A });
    expect(edge.saves.at(-1).accountSettings.owner).toBe(A);
    expect(u.ask).not.toHaveBeenCalled();
    expect(edge.resumed).toBe(1);
  });

  it("settings of unknown origin: nothing changes, the cloud sync waits, and the user is asked", async () => {
    const mod = await load(); const u = ui();
    await mod.createAccountSettingsHandler(u)({ key: A, previous: undefined });
    expect(edge.saves).toEqual([]);
    expect(edge.held).toBe(true);
    expect(u.ask).toHaveBeenCalledWith("ask-legacy");
    expect(mod.pendingAccountQuestion()).toBe("ask-legacy");
    expect(await mod.applyAccountChoice("fresh")).toBe(true);
    expect(edge.current.shelves).toEqual([]);
    expect(edge.current.accountSettings.buckets.legacy.shelves).toEqual([{ id: "a1" }]);
    expect(edge.snapshots).toEqual(["account"]);
    expect(edge.held).toBe(false);
    expect(mod.pendingAccountQuestion()).toBeNull();
  });

  it("an account back on the device gets its own shelves, with a snapshot and a notice", async () => {
    edge.current = { ...edge.current, accountSettings: { owner: A, buckets: { [B]: { shelves: [{ id: "b1" }] } } } };
    const mod = await load(); const u = ui();
    await mod.createAccountSettingsHandler(u)({ key: B, previous: A });
    expect(edge.current.shelves).toEqual([{ id: "b1" }]);
    expect(edge.snapshots).toEqual(["account"]);
    expect(u.restored).toHaveBeenCalledTimes(1);
    expect(edge.resumed).toBe(1);
  });

  it("decides on the settings file, not on a local copy that may be older", async () => {
    edge.fileRead = false;
    const mod = await load(); const u = ui();
    const done = mod.createAccountSettingsHandler(u)({ key: B, previous: A });
    await Promise.resolve();
    expect(edge.saves).toEqual([]);
    edge.current = { ...edge.current, accountSettings: { owner: A, buckets: { [B]: { shelves: [{ id: "b1" }] } } } };
    edge.fileRead = true;
    edge.readListeners.forEach((fn) => fn());
    await done;
    expect(edge.current.shelves).toEqual([{ id: "b1" }]);
  });

  it("shared settings: no change and no question", async () => {
    edge.current = { ...edge.current, accountSettings: { mode: "shared", owner: A } };
    const mod = await load(); const u = ui();
    await mod.createAccountSettingsHandler(u)({ key: B, previous: A });
    expect(edge.saves).toEqual([]);
    expect(u.ask).not.toHaveBeenCalled();
    expect(edge.resumed).toBe(0);
  });

  it("an answer with no question pending does nothing", async () => {
    const mod = await load();
    expect(await mod.applyAccountChoice("keep")).toBe(false);
    expect(edge.saves).toEqual([]);
  });
});
