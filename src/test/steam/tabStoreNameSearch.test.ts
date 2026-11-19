// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ShelfSource } from "../../types";

const state = vi.hoisted(() => ({
  apps: [] as any[],
  call: vi.fn(async (_method: string) => ({ tabs: [] })),
}));

vi.mock("../../runtime/host/decky", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../runtime/host/decky")>()),
  call: state.call,
}));
vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => state.apps,
}));
vi.mock("../../steam/libraryTabs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../steam/libraryTabs")>();
  return { ...original, listLibraryTabs: vi.fn(original.listLibraryTabs) };
});

import { resolveShelfAppIds } from "../../steam";
import { listLibraryTabs } from "../../steam/libraryTabs";

const tab = (name: string): ShelfSource => ({ type: "tab", tab: name }) as ShelfSource;

function tabListCalls(): number {
  return state.call.mock.calls.filter(([method]) => method === "get_tabmaster_tabs").length;
}

beforeEach(() => {
  state.apps = [
    { appid: 1, display_name: "App 1", installed: true },
    { appid: 3, display_name: "App 3", installed: true },
  ];
  state.call.mockClear();
  vi.mocked(listLibraryTabs).mockClear();
});

afterEach(() => { delete (window as any).LibraryTabStore; });

describe("a tab shelf asking tab stores by tab name", () => {
  it("does not list the library tabs when no store can answer", async () => {
    expect(await resolveShelfAppIds(tab("all"), 20)).toEqual([1, 3]);
    expect(listLibraryTabs).not.toHaveBeenCalled();
    expect(tabListCalls()).toBe(0);
  });

  it("still asks by tab name when a store answered with an empty list", async () => {
    const GetAppsForTab = vi.fn((id: string) => (id === "All Games" ? [{ appid: 3 }] : []));
    (window as any).LibraryTabStore = { GetAppsForTab };
    expect(await resolveShelfAppIds(tab("all"), 20)).toEqual([3]);
    expect(listLibraryTabs).toHaveBeenCalledTimes(1);
    expect(tabListCalls()).toBe(1);
    expect(GetAppsForTab).toHaveBeenCalledWith("All Games");
  });
});
