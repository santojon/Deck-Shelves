// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { getTabAppIdsFromStore, queryTabStores } from "../../steam/libraryTabs";

const registered: string[] = [];

function register(name: string, value: unknown): void {
  Object.defineProperty(window, name, { value, configurable: true, enumerable: true, writable: true });
  registered.push(name);
}

afterEach(() => {
  for (const name of registered.splice(0)) delete (window as any)[name];
});

describe("asking a tab store for a tab's games", () => {
  it.each([
    ["all", ["all"]],
    ["My Tab", ["My Tab", "my_tab"]],
    ["/library/home", ["/library/home", "libraryhome"]],
  ])("asks a store once per distinct spelling of %s, in order", async (tab, spellings) => {
    const GetAppsForTab = vi.fn(() => []);
    register("LibraryTabStore", { GetAppsForTab });
    await getTabAppIdsFromStore(tab);
    expect(GetAppsForTab.mock.calls.map((args: unknown[]) => args[0])).toEqual(spellings);
  });
});

describe("looking for tab stores on the Steam window", () => {
  function registerGetter(name: string, get: () => unknown): void {
    Object.defineProperty(window, name, { get, configurable: true, enumerable: true });
    registered.push(name);
  }

  it("finds a store registered under an unlisted global name", async () => {
    register("customTabProvider", { GetAppsForTab: () => [7, 8] });
    expect(await getTabAppIdsFromStore("all")).toEqual([7, 8]);
  });

  it("does not read window properties whose name does not look like a tab store", async () => {
    let reads = 0;
    registerGetter("someUnrelatedGlobal", () => { reads++; return {}; });
    await getTabAppIdsFromStore("all");
    expect(reads).toBe(0);
  });

  it("an unrelated property that throws when read does not hide a store", async () => {
    registerGetter("someUnrelatedGlobal", () => { throw new Error("not readable"); });
    register("customTabProvider", { GetAppsForTab: () => [7] });
    expect(await getTabAppIdsFromStore("all")).toEqual([7]);
  });
});

describe("telling apart what the tab stores answered", () => {
  it("reports that no store can answer when no window exposes a tab method", async () => {
    expect(await queryTabStores("all")).toEqual({ status: "unavailable" });
    register("LibraryTabStore", { GetTabs: () => [] });
    expect(await queryTabStores("all")).toEqual({ status: "unavailable" });
  });

  it.each([
    ["a plain list", []],
    ["a wrapped list", { apps: [] }],
  ])("reports an empty tab when a store answers with %s that holds nothing", async (_label, answer) => {
    register("LibraryTabStore", { GetAppsForTab: () => answer });
    expect(await queryTabStores("all")).toEqual({ status: "empty" });
  });

  it.each([
    ["a set", new Set([1, 2])],
    ["a string", "1,2"],
    ["nothing", undefined],
    ["a list of names", ["Portal"]],
  ])("reports an unreadable answer when the store returns %s", async (_label, answer) => {
    register("LibraryTabStore", { GetAppsForTab: () => answer });
    expect(await queryTabStores("all")).toEqual({ status: "incompatible" });
  });

  it("reports an error when every call throws", async () => {
    const GetAppsForTab = vi.fn(() => { throw new Error("store gone"); });
    register("LibraryTabStore", { GetAppsForTab });
    expect(await queryTabStores("My Tab")).toEqual({ status: "error" });
    expect(GetAppsForTab).toHaveBeenCalledTimes(2);
  });

  it("still asks the next store after one throws", async () => {
    register("LibraryTabStore", { GetAppsForTab: () => { throw new Error("store gone"); } });
    register("customTabProvider", { GetAppsForTab: () => [5] });
    expect(await queryTabStores("all")).toEqual({ status: "ok", ids: [5] });
  });

  it("an empty answer from one store outranks an error from another", async () => {
    register("LibraryTabStore", { GetAppsForTab: () => { throw new Error("store gone"); } });
    register("customTabProvider", { GetAppsForTab: () => [] });
    expect(await queryTabStores("all")).toEqual({ status: "empty" });
  });

  it("returns the ids of the first store that answers", async () => {
    register("LibraryStore", { GetAppsForTab: () => [1] });
    register("customTabProvider", { GetAppsForTab: () => [2] });
    expect(await queryTabStores("all")).toEqual({ status: "ok", ids: [1] });
  });

  it.each([
    ["no store", null, []],
    ["an empty answer", () => [], []],
    ["an unreadable answer", () => "1,2", []],
    ["a failing store", () => { throw new Error("store gone"); }, []],
    ["a store with games", () => [{ appid: 4 }, { appid: 9 }], [4, 9]],
  ])("the plain id list callers get stays the same with %s", async (_label, method, expected) => {
    if (method) register("LibraryTabStore", { GetAppsForTab: method });
    expect(await getTabAppIdsFromStore("all")).toEqual(expected);
  });
});
