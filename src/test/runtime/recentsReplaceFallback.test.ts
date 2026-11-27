// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({
  settings: null as any,
  ids: {} as Record<string, number[]>,
  hooks: null as any,
  refresh: null as null | (() => void),
}));

vi.mock("../../runtime/recentsRowPatch", () => ({
  installRecentsRowPatch: (_router: unknown, hooks: unknown) => { live.hooks = hooks; return { uninstall() {}, requestRender: () => true }; },
}));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => live.settings, subscribeSettings: () => () => {} }));
vi.mock("../../steam/smartShelves", () => ({ evalVisibility: () => true }));
vi.mock("../../steam", () => ({ applyManualOrder: (ids: number[]) => ids, manualResolveLimit: (limit: number) => limit }));
vi.mock("../../runtime/platformContext", () => ({
  getPlatform: () => ({ resolveShelfAppIds: (_s: unknown, _l: number, _o: unknown, shelfId: string) => Promise.resolve(live.ids[shelfId] ?? []) }),
}));
vi.mock("../../core/shelfRefresh", () => ({ subscribeShelfRefresh: (cb: () => void) => { live.refresh = cb; return () => {}; } }));
vi.mock("../../components/notify", () => ({ notify: () => {} }));
vi.mock("../../runtime/logger", () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

import { installRecentsReplace, getRecentsReplaceActiveShelfId } from "../../runtime/recentsReplace";

const shelf = (id: string, title: string, limit: number) => ({ id, title, enabled: true, hidden: false, limit, source: { type: "filter", filter: {} } });

describe("recents row with an empty first shelf", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    live.settings = { enabled: true, hideRecents: true, recentsReplaceSource: true, shelves: [shelf("a", "Downloads", 10), shelf("b", "Recently added", 20)] };
    (globalThis as any).appStore = { GetAppOverviewByAppID: () => ({ app_type: 1 }) };
    (globalThis as any).collectionStore = { allAppsCollection: { apps: new Set([1, 2, 3, 7, 8]) } };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).appStore;
    delete (globalThis as any).collectionStore;
  });

  it("fills the row from the next shelf with games, goes back to the first once it has games, and leaves Steam's games when none has any", async () => {
    live.ids = { a: [], b: [1, 2, 3] };
    const handle = installRecentsReplace({});
    expect(live.hooks.getContent()).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    expect(live.hooks.getContent()).toMatchObject({ appIds: [1, 2, 3], title: "Recently added" });
    expect(getRecentsReplaceActiveShelfId()).toBe("b");

    live.ids = { a: [7, 8], b: [1, 2, 3] };
    live.refresh?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(live.hooks.getContent()).toMatchObject({ appIds: [7, 8], title: "Downloads" });
    expect(getRecentsReplaceActiveShelfId()).toBe("a");

    live.ids = {};
    live.refresh?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(live.hooks.getContent()).toBeNull();
    expect(getRecentsReplaceActiveShelfId()).toBeNull();
    handle?.uninstall?.();
  });
});
