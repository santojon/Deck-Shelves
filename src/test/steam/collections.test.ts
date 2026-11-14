// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dynamicCollectionAppIds, getCollectionApps, listCollections, removeAppFromCollection } from "../../steam/collections";

/* The client's collection store, as read on a Steam Deck: GetCollection(id)
   returns the live collection, the storage map holds the same objects, and a
   dynamic collection's `allApps` are its effective members. */
function collection(id: string, name: string, apps: number[], extra: Record<string, unknown> = {}) {
  return {
    id, displayName: name, bIsDynamic: false,
    allApps: apps.map((appid) => ({ appid })),
    visibleApps: apps.map((appid) => ({ appid })),
    apps: new Set(apps),
    ...extra,
  };
}

function makeStore() {
  const installedLocally = collection("uc-QQ13so08XRHH", "Instalados localmente", [282800, 410110, 578850], { bIsDynamic: true, apps: new Set([282800, 410110, 578850, 999]) });
  const local = collection("local-install", "Jogos instalados localmente", [384190, 108710]);
  const gog = collection("uc-Vq4YlQaCmO04", "[Unifideck] GOG", [], { apps: new Set([1, 2, 3]) });
  const favorite = collection("favorite", "Favoritos", []);
  const byId = new Map<string, any>([[installedLocally.id, installedLocally], [gog.id, gog], [favorite.id, favorite]]);
  return {
    allAppsCollection: { apps: new Set([1]) },
    localGamesCollection: local,
    m_mapCollectionsFromStorage: byId,
    GetCollection: (id: string) => byId.get(id) ?? (id === "local-install" ? local : undefined),
    collections: { installedLocally, local, gog, favorite },
  };
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  store = makeStore();
  vi.stubGlobal("collectionStore", store);
});

afterEach(() => vi.unstubAllGlobals());

describe("getCollectionApps", () => {
  it("resolves by id only and returns the effective apps of a dynamic collection, whatever its name says", async () => {
    expect(await getCollectionApps("uc-QQ13so08XRHH")).toEqual([282800, 410110, 578850]);
  });

  it("never reads the manual id set: ids the library no longer has are not members", async () => {
    expect(await getCollectionApps("uc-Vq4YlQaCmO04")).toEqual([]);
  });

  it("finds a system collection through GetCollection and a URL-encoded id through its decoded form", async () => {
    expect(await getCollectionApps("local-install")).toEqual([384190, 108710]);
    expect(await getCollectionApps(encodeURIComponent("uc-QQ13so08XRHH"))).toEqual([282800, 410110, 578850]);
  });

  it("tells a missing collection (null) from an empty one ([])", async () => {
    expect(await getCollectionApps("favorite")).toEqual([]);
    expect(await getCollectionApps("Instalados localmente")).toBeNull();
    expect(await getCollectionApps("uc-nope")).toBeNull();
  });

  it("does not match a collection by its name or a part of its id", async () => {
    expect(await getCollectionApps("uc-QQ13")).toBeNull();
    expect(await getCollectionApps("Jogos instalados localmente")).toBeNull();
  });
});

describe("listCollections", () => {
  it("lists the stored collections once each, plus the installed-games one, by id and name, saying which are dynamic", async () => {
    const list = await listCollections();
    expect(list).toEqual([
      { id: "uc-QQ13so08XRHH", name: "Instalados localmente", isDynamic: true },
      { id: "uc-Vq4YlQaCmO04", name: "[Unifideck] GOG", isDynamic: false },
      { id: "favorite", name: "Favoritos", isDynamic: false },
      { id: "local-install", name: "Jogos instalados localmente", isDynamic: false },
    ]);
  });

  it("unites the effective apps of the dynamic collections only", () => {
    expect([...dynamicCollectionAppIds()].sort()).toEqual([282800, 410110, 578850]);
    vi.stubGlobal("collectionStore", undefined);
    expect(dynamicCollectionAppIds().size).toBe(0);
  });

  it("leaves the installed-games getter alone until the store has built its collections", async () => {
    let reads = 0;
    Object.defineProperty(store, "localGamesCollection", { get: () => { reads++; return store.collections.local; } });
    (store as any).allAppsCollection = undefined;
    const list = await listCollections();
    expect(reads).toBe(0);
    expect(list.some((c) => c.id === "local-install")).toBe(false);
  });

  it("is empty when there is no store", async () => {
    vi.stubGlobal("collectionStore", undefined);
    expect(await listCollections()).toEqual([]);
  });
});

describe("removeAppFromCollection", () => {
  it("removes through the editable view and saves", () => {
    const removed: number[][] = [];
    let saved = 0;
    const target = store.collections.installedLocally as any;
    target.AsEditableCollection = () => ({ RemoveApps: (ids: number[]) => removed.push(ids), Save: () => { saved++; } });
    removeAppFromCollection("uc-QQ13so08XRHH", 410110);
    expect(removed).toEqual([[410110]]);
    expect(saved).toBe(1);
  });

  it("does nothing for an unknown id or a collection that cannot be edited", () => {
    expect(() => removeAppFromCollection("uc-nope", 1)).not.toThrow();
    expect(() => removeAppFromCollection("favorite", 1)).not.toThrow();
  });
});
