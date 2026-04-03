import { describe, it, expect } from 'vitest';
import { normalizeAppOverview, enrichAppStateFlags, AppOverview } from '../steam';
import { setPreferredSteamWindow } from '../runtime/steamHost';

describe('steam helpers', () => {
  it('normalizeAppOverview does NOT mark installed based on exe_path alone', () => {
    const raw = { appid: 9001, display_name: 'UD Shortcut', executable: '/home/deck/games/game.exe' };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    // exe_path alone is not proof of installation — all shortcuts have one
    expect((norm as AppOverview).installed).toBeUndefined();
  });

  it('normalizeAppOverview marks installed when per_client_data.display_status > 0', () => {
    const raw = { appid: 9003, display_name: 'Installed Game', per_client_data: [{ display_status: 2 }] };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBe(true);
  });

  it('normalizeAppOverview marks NOT installed when per_client_data.display_status === 0', () => {
    const raw = { appid: 9004, display_name: 'Not Installed', per_client_data: [{ display_status: 0 }] };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBe(false);
  });

  it('normalizeAppOverview leaves installed undefined when no evidence', () => {
    const raw = { appid: 9002, display_name: 'No Path App' };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBeUndefined();
  });

  it('enrichAppStateFlags marks installed via appStore per_client_data', async () => {
    const items: AppOverview[] = [{ appid: 123, display_name: 'Shortcut 123', is_non_steam: true }];
    const mockWin: any = {
      appStore: {
        GetAppOverviewByAppID: (id: number) => {
          if (id === 123) return { per_client_data: [{ display_status: 2 }] };
          return null;
        }
      }
    };
    setPreferredSteamWindow(mockWin as any);
    const realWindow = (globalThis as any).window;
    (globalThis as any).window = mockWin;
    try {
      const enriched = await enrichAppStateFlags(items);
      const found = enriched.find((a) => a.appid === 123);
      expect(found).toBeDefined();
      expect((found as any).installed).toBe(true);
    } finally {
      setPreferredSteamWindow(null as any);
      if (realWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = realWindow;
    }
  });

  it('enrichAppStateFlags marks NOT installed when display_status is 0', async () => {
    const items: AppOverview[] = [{ appid: 456, display_name: 'Not Installed Shortcut', is_non_steam: true }];
    const mockWin: any = {
      appStore: {
        GetAppOverviewByAppID: (id: number) => {
          if (id === 456) return { per_client_data: [{ display_status: 0 }] };
          return null;
        }
      }
    };
    setPreferredSteamWindow(mockWin as any);
    const realWindow = (globalThis as any).window;
    (globalThis as any).window = mockWin;
    try {
      const enriched = await enrichAppStateFlags(items);
      const found = enriched.find((a) => a.appid === 456);
      expect(found).toBeDefined();
      expect((found as any).installed).toBe(false);
    } finally {
      setPreferredSteamWindow(null as any);
      if (realWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = realWindow;
    }
  });
});
