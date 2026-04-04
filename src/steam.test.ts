import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeAppOverview, enrichAppStateFlags, AppOverview } from './steam';

describe('steam helpers', () => {
  it('normalizeAppOverview heuristically marks installed when exe path exists', () => {
    const raw = { appid: 9001, display_name: 'UD Shortcut', executable: '/home/deck/games/game.exe' };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBe(true);
  });

  it('normalizeAppOverview leaves installed undefined when no evidence', () => {
    const raw = { appid: 9002, display_name: 'No Path App' };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBeUndefined();
  });

  it('enrichAppStateFlags marks installed based on collectionStore shortcuts', async () => {
    // Prepare items list including app 123
    const items: AppOverview[] = [{ appid: 123, display_name: 'Shortcut 123' }];
    // Mock a host window with collectionStore.shortcutsCollection containing a local path
    const mockWin: any = {
      collectionStore: {
        shortcutsCollection: {
          allApps: [ { appid: 123, executable: '/usr/bin/fake' } ]
        }
      }
    };
    // Stub getPreferredSteamWindow to return our mock window
    const realGetPref = (globalThis as any).getPreferredSteamWindow;
    (globalThis as any).getPreferredSteamWindow = () => mockWin;
    try {
      const enriched = await enrichAppStateFlags(items);
      const found = enriched.find((a) => a.appid === 123);
      expect(found).toBeDefined();
      expect((found as any).installed).toBe(true);
    } finally {
      // restore
      (globalThis as any).getPreferredSteamWindow = realGetPref;
    }
  });
});
