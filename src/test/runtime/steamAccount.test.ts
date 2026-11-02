import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const edge = vi.hoisted(() => ({ snapshots: [] as string[], saves: 0, logs: [] as string[] }));
vi.mock("../../store/settingsStore", () => ({
  createSafetySnapshot: async (kind: string) => { edge.snapshots.push(kind); },
  saveSettings: async () => { edge.saves++; return true; },
}));
vi.mock("../../runtime/logger", () => ({
  logInfo: (...args: unknown[]) => { edge.logs.push(JSON.stringify(args)); },
}));
// The backend's salt file: the first valid salt it is offered stays; down means it cannot answer.
const backend = vi.hoisted(() => ({ salt: "", up: true, calls: 0 }));
vi.mock("../../runtime/host/decky", () => ({
  call: async (name: string, arg: { salt?: string }) => {
    backend.calls++;
    if (!backend.up || name !== "keep_account_salt") throw new Error("backend not ready");
    if (!backend.salt && /^[0-9a-f]{32}$/.test(arg?.salt ?? "")) backend.salt = arg.salt as string;
    return { salt: backend.salt };
  },
}));

const A = "76561198000000001";
const B = "76561198000000002";
const STORE_KEY = "deck-shelves-account-v1";
const noWait = async () => {};

let storage: Map<string, string>;

async function load() {
  vi.resetModules();
  return import("../../runtime/steamAccount");
}

// One start of the plugin with these account readings (one per check).
async function start(readings: Array<string | null>, onKnown?: () => void) {
  const mod = await load();
  const onSwitch = vi.fn();
  const queue = [...readings];
  mod.installSteamAccountWatch({ onSwitch, onKnown, read: () => (queue.length > 1 ? queue.shift()! : queue[0]), wait: noWait });
  await mod.accountReady();
  return { mod, onSwitch };
}

const stored = () => JSON.parse(storage.get(STORE_KEY) ?? "null");

describe("watching the signed-in Steam account", () => {
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, String(v)); },
      removeItem: (k: string) => { storage.delete(k); },
    });
    edge.snapshots = [];
    edge.saves = 0;
    edge.logs = [];
    Object.assign(backend, { salt: "", up: true, calls: 0 });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("remembers the first account as a salted 16-hex key, never the id itself", async () => {
    const { onSwitch } = await start([A, A]);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(edge.snapshots).toEqual([]);
    expect(stored().last).toMatch(/^[0-9a-f]{16}$/);
    expect([...storage.values()].join("")).not.toContain(A);
    expect(edge.saves).toBe(0); // nothing reaches the settings file
  });

  it("the same account again changes nothing", async () => {
    await start([A, A]);
    const before = storage.get(STORE_KEY);
    const { onSwitch } = await start([A, A]);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(edge.snapshots).toEqual([]);
    expect(storage.get(STORE_KEY)).toBe(before);
  });

  it("another account: a safety snapshot, then the notice, and the switch is remembered as yes/no", async () => {
    await start([A, A]);
    const { mod, onSwitch } = await start([B, B]);
    expect(edge.snapshots).toEqual(["account"]);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(mod.accountSwitchSeen()).toBe(true);
  });

  it("an unknown or unsteady reading is never a switch", async () => {
    await start([A, A]);
    const before = storage.get(STORE_KEY);
    const unknown = await start([null]);
    const unsteady = await start([B, A, B, A]);
    expect(unknown.onSwitch).not.toHaveBeenCalled();
    expect(unsteady.onSwitch).not.toHaveBeenCalled();
    expect(edge.snapshots).toEqual([]);
    expect(storage.get(STORE_KEY)).toBe(before);
  });

  it("reads the id from Steam's current user, and anything not shaped like a SteamID64 is unknown", async () => {
    const mod = await load();
    vi.stubGlobal("App", { GetCurrentUser: () => ({ strSteamID: A }) });
    expect(mod.readSteamId()).toBe(A);
    vi.stubGlobal("App", { GetCurrentUser: () => ({ strSteamID: "12345" }) });
    expect(mod.readSteamId()).toBeNull();
    // Account 0, reported at start before anyone is signed in, is no account.
    vi.stubGlobal("App", { GetCurrentUser: () => ({ strSteamID: "76561197960265728" }) });
    expect(mod.readSteamId()).toBeNull();
    vi.stubGlobal("App", { GetCurrentUser: () => ({ strSteamID: "76561197960265729" }) });
    expect(mod.readSteamId()).toBe("76561197960265729");
    vi.stubGlobal("App", { GetCurrentUser: () => { throw new Error("not ready"); } });
    expect(mod.readSteamId()).toBeNull();
    vi.stubGlobal("App", undefined);
    expect(mod.readSteamId()).toBeNull();
  });

  it("the cloud sync waits after a switch until the user resumes it for the new account", async () => {
    const first = await start([A, A]);
    first.mod.markCloudSyncedAccount();
    expect(first.mod.isCloudSyncHeldForAccount()).toBe(false);
    const { mod } = await start([B, B]);
    expect(mod.isCloudSyncHeldForAccount()).toBe(true);
    const resumed = vi.fn();
    mod.onCloudSyncResumed(resumed);
    mod.resumeCloudSyncForAccount();
    expect(mod.isCloudSyncHeldForAccount()).toBe(false);
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(stored().synced).toBe(stored().last);
  });

  it("without a watch, nothing waits and nothing is held", async () => {
    const mod = await load();
    await expect(mod.accountReady()).resolves.toBeUndefined();
    expect(mod.isCloudSyncHeldForAccount()).toBe(false);
    expect(mod.accountSwitchSeen()).toBe(false);
  });

  it("a first start keeps one new salt in the backend and in the local record, and nowhere else", async () => {
    await start([A, A]);
    expect(stored().salt).toMatch(/^[0-9a-f]{32}$/);
    expect(backend.salt).toBe(stored().salt);
    expect(edge.saves).toBe(0); // never in the settings file, so never synced, exported or reported
    expect(edge.logs.join("")).not.toContain(stored().salt);
  });

  it("the backend's salt restores a cleared local record, so the account keeps its key", async () => {
    const first = await start([A, A]);
    const key = first.mod.currentAccountKey();
    const salt = stored().salt;
    storage.clear();
    const { mod, onSwitch } = await start([A, A]);
    expect(stored().salt).toBe(salt);
    expect(mod.currentAccountKey()).toBe(key);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("the local salt restores the backend's copy when it has none", async () => {
    const first = await start([A, A]);
    const key = first.mod.currentAccountKey();
    backend.salt = "";
    const { mod, onSwitch } = await start([A, A]);
    expect(backend.salt).toBe(stored().salt);
    expect(mod.currentAccountKey()).toBe(key);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("the backend's salt wins over a different local one, and keys taken with the old one are not read as a switch", async () => {
    const first = await start([A, A]);
    first.mod.markCloudSyncedAccount();
    backend.salt = "11".repeat(16);
    const { mod, onSwitch } = await start([A, A]);
    expect(stored().salt).toBe("11".repeat(16));
    expect(mod.currentAccountKey()).toBe(await mod.accountKey(A, "11".repeat(16)));
    expect(stored().last).toBe(mod.currentAccountKey());
    expect(stored().synced).toBeUndefined();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(edge.snapshots).toEqual([]);
  });

  it("while the backend cannot answer, the local salt is used and written back once the start settles", async () => {
    const first = await start([A, A]);
    const key = first.mod.currentAccountKey();
    const salt = stored().salt;
    Object.assign(backend, { salt: "", up: false });
    const { mod, onSwitch } = await start([A, A], () => { backend.up = true; });
    expect(mod.currentAccountKey()).toBe(key);
    expect(onSwitch).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(backend.salt).toBe(salt));
  });

  it("with neither copy and no backend, a new salt is made, kept locally and given to the backend later", async () => {
    backend.up = false;
    const { mod } = await start([A, A], () => { backend.up = true; });
    expect(stored().salt).toMatch(/^[0-9a-f]{32}$/);
    expect(mod.currentAccountKey()).toBe(await mod.accountKey(A, stored().salt));
    await vi.waitFor(() => expect(backend.salt).toBe(stored().salt));
    expect(backend.calls).toBe(3); // two tries at start, one after it
  });

  it("a key depends on the device's salt", async () => {
    const mod = await load();
    const one = await mod.accountKey(A, "00".repeat(16));
    const two = await mod.accountKey(A, "11".repeat(16));
    expect(one).toMatch(/^[0-9a-f]{16}$/);
    expect(one).not.toBe(two);
  });
});
