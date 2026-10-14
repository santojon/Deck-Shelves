import { beforeEach, describe, expect, it, vi } from "vitest";

const store: { current: any } = { current: null };
const saved: any[] = [];
const cloud: { raw: string | null; writes: string[] } = { raw: null, writes: [] };

vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => store.current,
  saveSettings: (n: any) => { saved.push(n); store.current = n; return Promise.resolve(true); },
  subscribeSettings: () => () => {},
}));
vi.mock("../../runtime/host/ownerGuard", () => ({ isHomeOwner: () => true }));
vi.mock("../../runtime/notify", () => ({ notifyUser: () => {} }));
vi.mock("../../i18n", () => ({ default: { t: (k: string) => k } }));

const SHELF = { id: "s1", name: "From the cloud", updatedAt: 500, enabled: true };
const SHELF_B = { id: "s2", name: "Made on the other device", updatedAt: 600, enabled: true };
const HANDHELD = { id: "p1", name: "Handheld", createdAt: "2026-10-01", updatedAt: 10, snapshot: { showBadges: false, shelves: [SHELF] } };
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
    cloud.raw = cloudDoc({
      shelves: [SHELF, SHELF_B], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [HANDHELD],
      showBadges: true, preferencesUpdatedAt: 900, syncTombstones: {},
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
    expect(pushed.profiles[0].snapshot.showBadges).toBe(true);
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
