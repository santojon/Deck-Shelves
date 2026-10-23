import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, listeners, writes, qa } = vi.hoisted(() => ({
  store: { current: null as any },
  listeners: [] as Array<() => void>,
  writes: [] as Array<[string, number]>,
  qa: { active: false },
}));

vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => store.current,
  // A QA build's save stays in memory; a normal one would also reach the backend.
  saveSettings: async (next: any) => { store.current = next; return true; },
  subscribeSettings: (fn: () => void) => { listeners.push(fn); return () => {}; },
}));
vi.mock("../../runtime/steamSettingsWriter", () => ({
  readIdleTimeoutSec: (key: string) => (key.endsWith("_ac_sec") ? 300 : 600),
  writeIdleTimeoutSec: async (key: string, value: number) => { writes.push([key, value]); return true; },
}));
vi.mock("../../qa/harness", () => ({ get qaOverrideActive() { return qa.active; } }));
vi.mock("../../steam", () => ({ resolveShelfAppIds: async () => [] }));
vi.mock("../../runtime/recentsReplace", () => ({ activeFirstShelf: () => null }));
vi.mock("../../core/onlineStore", () => ({ getStoreScreenshots: async () => new Map() }));

import { installScreensaverInject } from "../../runtime/screensaverInject";

// The verified backup save waits 200 ms per attempt.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

function turnOn(): void {
  store.current = { ...store.current, screensaverShelvesEnabled: true };
  for (const fn of listeners) fn();
}

describe("Steam's idle screensaver timer and QA builds", () => {
  beforeEach(() => { writes.length = 0; listeners.length = 0; });
  afterEach(() => { qa.active = false; });

  it("a QA build never turns Steam's timer off when no backup is saved yet", async () => {
    qa.active = true;
    store.current = { screensaverShelvesEnabled: false };
    installScreensaverInject();
    turnOn();
    await settle();
    expect(writes).toEqual([]);
  });

  it("a QA build keeps the timer off when the settings already hold the backup", async () => {
    qa.active = true;
    store.current = { screensaverShelvesEnabled: true, screensaverIdleBackupAcSec: 300, screensaverIdleBackupBatterySec: 600 };
    installScreensaverInject();
    await settle();
    expect(writes).toEqual([["system_idle_screensaver_ac_sec", 0], ["system_idle_screensaver_battery_sec", 0]]);
  });

  it("a normal build saves the backup first, then turns the timer off", async () => {
    store.current = { screensaverShelvesEnabled: false };
    installScreensaverInject();
    turnOn();
    await settle();
    expect(store.current).toMatchObject({ screensaverIdleBackupAcSec: 300, screensaverIdleBackupBatterySec: 600 });
    expect(writes).toEqual([["system_idle_screensaver_ac_sec", 0], ["system_idle_screensaver_battery_sec", 0]]);
  });
});
