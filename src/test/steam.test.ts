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

  it('normalizeAppOverview marks installed when per_client_data has explicit installed:true', () => {
    // Real Steam data: ds=11 games have an explicit `installed` field in pcd
    const raw = { appid: 9003, display_name: 'Installed Game', per_client_data: [{ display_status: 11, installed: true }] };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBe(true);
  });

  it('normalizeAppOverview leaves installed undefined when per_client_data has no installed field (ds=9)', () => {
    // Real Steam data: ds=9 = available on remote device, no explicit installed in pcd
    const raw = { appid: 9004, display_name: 'Remote Game', per_client_data: [{ display_status: 9 }] };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    // undefined → DeckRow treats as not installed (conservative, shows download icon)
    expect((norm as AppOverview).installed).toBeUndefined();
  });

  it('normalizeAppOverview leaves installed undefined for Steam apps with no evidence', () => {
    const raw = { appid: 9002, display_name: 'No Path App' };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBeUndefined();
  });

  it('normalizeAppOverview defaults non-Steam shortcuts to NOT installed when no evidence', () => {
    const raw = { appid: 9005, display_name: 'UD Shortcut No Evidence', is_non_steam: true };
    const norm = normalizeAppOverview(raw);
    expect(norm).not.toBeNull();
    expect((norm as AppOverview).installed).toBe(false);
  });

  it('enrichAppStateFlags defaults non-Steam to NOT installed when appStore has no data', async () => {
    const items: AppOverview[] = [{ appid: 789, display_name: 'No Data Shortcut', is_non_steam: true }];
    const mockWin: any = {
      appStore: {
        GetAppOverviewByAppID: (_id: number) => {
          // Return raw overview with no install evidence
          return { appid: 789 };
        }
      }
    };
    setPreferredSteamWindow(mockWin as any);
    const realWindow = (globalThis as any).window;
    (globalThis as any).window = mockWin;
    try {
      const enriched = await enrichAppStateFlags(items);
      const found = enriched.find((a) => a.appid === 789);
      expect(found).toBeDefined();
      expect((found as any).installed).toBe(false);
    } finally {
      setPreferredSteamWindow(null as any);
      if (realWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = realWindow;
    }
  });

  it('enrichAppStateFlags marks installed via appStore per_client_data explicit installed field', async () => {
    // Real Steam data: installed games have explicit installed:true in pcd
    const items: AppOverview[] = [{ appid: 123, display_name: 'Shortcut 123', is_non_steam: true }];
    const mockWin: any = {
      appStore: {
        GetAppOverviewByAppID: (id: number) => {
          if (id === 123) return { per_client_data: [{ display_status: 11, installed: true }] };
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

  it('enrichAppStateFlags leaves installed undefined when per_client_data has no installed field (ds=9)', async () => {
    // Real Steam data: ds=9 = available on remote, no explicit installed in pcd
    const items: AppOverview[] = [{ appid: 456, display_name: 'Remote Game', is_non_steam: false }];
    const mockWin: any = {
      appStore: {
        GetAppOverviewByAppID: (id: number) => {
          if (id === 456) return { per_client_data: [{ display_status: 9 }] };
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
      // No explicit installed field → undefined → DeckRow shows download icon (conservative)
      expect((found as any).installed).toBeUndefined();
    } finally {
      setPreferredSteamWindow(null as any);
      if (realWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = realWindow;
    }
  });
});
