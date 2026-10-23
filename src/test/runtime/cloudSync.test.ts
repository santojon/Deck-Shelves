import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store: { current: any } = { current: null };
const saved: any[] = [];
const cloud: { raw: string | null; writes: string[] } = { raw: null, writes: [] };
const qa = { active: false };

vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => store.current,
  saveSettings: (n: any) => { saved.push(n); store.current = n; return Promise.resolve(true); },
  subscribeSettings: () => () => {},
}));
vi.mock("../../runtime/host/ownerGuard", () => ({ isHomeOwner: () => true }));
vi.mock("../../runtime/notify", () => ({ notifyUser: () => {} }));
vi.mock("../../i18n", () => ({ default: { t: (k: string) => k } }));
vi.mock("../../qa/harness", () => ({ get qaOverrideActive() { return qa.active; } }));

const SHELF = { id: "s1", name: "From the cloud", updatedAt: 500, enabled: true };
const SHELF_B = { id: "s2", name: "Made on the other device", updatedAt: 600, enabled: true };
const HANDHELD = { id: "p1", name: "Handheld", createdAt: "2026-10-01", updatedAt: 10, snapshot: { showBadges: false, shelves: [SHELF] } };
const SHOWCASE = { id: "p2", name: "Showcase", createdAt: "2026-10-01", updatedAt: 20, snapshot: { showBadges: true, shelves: [SHELF] } };
function cloudDoc(settings: any): string {
  return JSON.stringify({ updatedAt: 1000, settings });
}

// Real time: the last-synced stamp lands behind a 200 ms verify delay.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

describe("cloud sync on an empty device", () => {
  beforeEach(() => {
    saved.length = 0; cloud.writes.length = 0;
    (globalThis as any).SteamClient = {
      RoamingStorage: {
        GetString: async () => cloud.raw ?? "",
        SetString: async (_k: string, v: string) => { cloud.writes.push(v); cloud.raw = v; },
      },
    };
    vi.resetModules();
  });

  it("adopts the cloud's shelves when the local snapshot has none", async () => {
    store.current = { cloudSyncEnabled: true, shelves: [], smartShelves: [], preferencesUpdatedAt: 0 };
    cloud.raw = cloudDoc({ shelves: [SHELF], smartShelves: [], preferencesUpdatedAt: 900 });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[0].shelves.map((s: any) => s.id)).toEqual(["s1"]);
  });

  it("never pushes an empty snapshot when the cloud is empty too", async () => {
    store.current = { cloudSyncEnabled: true, shelves: [], smartShelves: [], preferencesUpdatedAt: 0 };
    cloud.raw = null;
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(cloud.writes).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("stamps the last-synced time when it adopts a cloud copy it did not need to rewrite", async () => {
    store.current = { cloudSyncEnabled: true, shelves: [], smartShelves: [], preferencesUpdatedAt: 0 };
    // Every synced list present, as a real settings document always has them.
    cloud.raw = cloudDoc({ shelves: [SHELF], smartShelves: [], preferencesUpdatedAt: 900, syncTombstones: {}, savedFilters: [], savedSmartFilters: [], profiles: [] });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(cloud.writes).toEqual([]);
    expect(saved[0].shelves.map((s: any) => s.id)).toEqual(["s1"]);
    expect(saved[saved.length - 1].cloudSyncLastSyncedAt).toBe(1000);
  });
});

describe("cloud sync while a profile is active", () => {
  beforeEach(() => {
    saved.length = 0; cloud.writes.length = 0;
    (globalThis as any).SteamClient = {
      RoamingStorage: {
        GetString: async () => cloud.raw ?? "",
        SetString: async (_k: string, v: string) => { cloud.writes.push(v); cloud.raw = v; },
      },
    };
    vi.resetModules();
  });

  it("keeps syncing and folds what it adopts into the active profile's snapshot", async () => {
    store.current = {
      cloudSyncEnabled: true, shelves: [SHELF], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD],
      activeProfileName: "Handheld", showBadges: false, preferencesUpdatedAt: 100, syncTombstones: {},
    };
    // The other device runs the same profile: its look is adopted and folded into it.
    cloud.raw = cloudDoc({
      shelves: [SHELF, SHELF_B], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD],
      showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {}, syncActiveProfile: "Handheld",
    });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    const adopted = saved[0];
    expect(adopted.activeProfileName).toBe("Handheld");
    expect(adopted.showBadges).toBe(true);
    expect(adopted.shelves.map((s: any) => s.id)).toEqual(["s1", "s2"]);
    expect(adopted.profiles[0].snapshot.showBadges).toBe(true);
    expect(adopted.profiles[0].snapshot.shelves.map((s: any) => s.id)).toEqual(["s1", "s2"]);
    expect(adopted.profiles[0].updatedAt).toBeGreaterThan(10);
    expect(cloud.writes).toHaveLength(1);
    const pushed = JSON.parse(cloud.writes[0]).settings;
    expect(pushed.activeProfileName).toBeUndefined();
    expect(pushed.syncActiveProfile).toBe("Handheld");
    expect(pushed.profiles[0].snapshot.showBadges).toBe(true);
  });

  it("keeps its own look when the other device runs a different profile, and still merges the lists", async () => {
    const SHELF_C = { id: "s3", name: "Made here", updatedAt: 700, enabled: true };
    store.current = {
      cloudSyncEnabled: true, shelves: [SHELF, SHELF_C], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD, SHOWCASE],
      activeProfileName: "Handheld", showBadges: false, preferencesUpdatedAt: 100, syncTombstones: {},
    };
    cloud.raw = cloudDoc({
      shelves: [SHELF, SHELF_B], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD, SHOWCASE],
      showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {}, syncActiveProfile: "Showcase",
    });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    const adopted = saved[0];
    expect(adopted.activeProfileName).toBe("Handheld");
    expect(adopted.showBadges).toBe(false); // the other device's look stays there
    expect(adopted.preferencesUpdatedAt).toBe(100);
    expect(adopted.shelves.map((s: any) => s.id).sort()).toEqual(["s1", "s2", "s3"]); // lists still merge
    expect(adopted.profiles[0].snapshot.showBadges).toBe(false); // nothing folded into Handheld
    expect(adopted.profiles[0].updatedAt).toBe(10);
    expect(adopted.syncActiveProfile).toBeUndefined();
    expect(cloud.writes).toHaveLength(1);
    const pushed = JSON.parse(cloud.writes[0]).settings;
    expect(pushed.showBadges).toBe(true); // the cloud keeps the Showcase look...
    expect(pushed.preferencesUpdatedAt).toBe(900);
    expect(pushed.syncActiveProfile).toBe("Showcase"); // ...under its own profile name
    expect(pushed.shelves.map((s: any) => s.id).sort()).toEqual(["s1", "s2", "s3"]);
    expect(pushed.activeProfileName).toBeUndefined();
  });

  it("writes nothing when the other device's copy already holds everything, whatever profile it runs", async () => {
    store.current = {
      cloudSyncEnabled: true, shelves: [SHELF], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD, SHOWCASE],
      activeProfileName: "Handheld", showBadges: false, preferencesUpdatedAt: 100, syncTombstones: {},
    };
    cloud.raw = cloudDoc({
      shelves: [SHELF], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD, SHOWCASE],
      showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {}, syncActiveProfile: "Showcase",
    });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(cloud.writes).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("treats a copy without a profile name as plain settings: a device running a profile keeps its look, one without adopts", async () => {
    const remote = { shelves: [SHELF], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD], showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {} };
    store.current = { ...remote, cloudSyncEnabled: true, activeProfileName: "Handheld", showBadges: false, preferencesUpdatedAt: 100 };
    cloud.raw = cloudDoc(remote);
    let mod = await import("../../runtime/cloudSync");
    let dispose = mod.installCloudSync();
    await settle();
    dispose();
    expect(saved).toEqual([]);
    expect(cloud.writes).toEqual([]);
    vi.resetModules();
    store.current = { ...remote, cloudSyncEnabled: true, activeProfileName: null, showBadges: false, preferencesUpdatedAt: 100 };
    mod = await import("../../runtime/cloudSync");
    dispose = mod.installCloudSync();
    await settle();
    dispose();
    expect(saved[0].showBadges).toBe(true);
  });

  it("leaves the active profile's snapshot alone when a pull adopts nothing", async () => {
    const shared = { shelves: [SHELF], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD], showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {} };
    store.current = { ...shared, cloudSyncEnabled: true, activeProfileName: "Handheld" };
    cloud.raw = cloudDoc(shared);
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(cloud.writes).toEqual([]);
    expect(saved).toEqual([]);
  });
});

describe("cloud sync and a copy a QA build pushed", () => {
  beforeEach(() => {
    saved.length = 0; cloud.writes.length = 0;
    (globalThis as any).SteamClient = {
      RoamingStorage: {
        GetString: async () => cloud.raw ?? "",
        SetString: async (_k: string, v: string) => { cloud.writes.push(v); cloud.raw = v; },
      },
    };
    vi.resetModules();
  });

  it("never merges it and replaces it with this device's own settings", async () => {
    store.current = { cloudSyncEnabled: true, shelves: [SHELF_B], smartShelves: [], showBadges: false, preferencesUpdatedAt: 100, syncTombstones: {} };
    // Newer clock and a shelf this device lacks: a plain copy would be adopted.
    cloud.raw = cloudDoc({ shelves: [SHELF], smartShelves: [], showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {}, __dsQaOverride: true });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(saved.some((s) => s.__dsQaOverride === true || s.showBadges === true || s.shelves?.some((x: any) => x.id === "s1"))).toBe(false);
    expect(cloud.writes).toHaveLength(1);
    const pushed = JSON.parse(cloud.writes[0]).settings;
    expect(pushed.__dsQaOverride).toBeUndefined();
    expect(pushed.shelves.map((s: any) => s.id)).toEqual(["s2"]);
  });
});

describe("cloud sync in a QA session", () => {
  const reads: string[] = [];
  beforeEach(() => {
    saved.length = 0; cloud.writes.length = 0; reads.length = 0;
    (globalThis as any).SteamClient = {
      RoamingStorage: {
        GetString: async (k: string) => { reads.push(k); return cloud.raw ?? ""; },
        SetString: async (_k: string, v: string) => { cloud.writes.push(v); cloud.raw = v; },
      },
    };
    vi.resetModules();
    qa.active = true;
  });
  afterEach(() => { qa.active = false; });

  it("never reads, adopts or pushes the account's cloud copy", async () => {
    // Fixture data that a merge would otherwise push into the account's copy.
    store.current = { cloudSyncEnabled: true, shelves: [SHELF_B], smartShelves: [], preferencesUpdatedAt: 900, __dsQaOverride: true };
    cloud.raw = cloudDoc({ shelves: [SHELF], smartShelves: [], preferencesUpdatedAt: 100 });
    const { installCloudSync } = await import("../../runtime/cloudSync");
    const dispose = installCloudSync();
    await settle();
    dispose();
    expect(reads).toEqual([]);
    expect(cloud.writes).toEqual([]);
    expect(saved).toEqual([]);
  });
});
