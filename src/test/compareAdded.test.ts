import { describe, it, expect } from 'vitest';
import { compareByAdded } from '../steam';

// JS Array.sort contract: compareFn(a, b) < 0 → a sorts before b (a first).
// `compareByAdded` orders by newest-first (descending) and returns
// `bVal - aVal`, so a-is-newer yields a negative result.
describe('compareByAdded', () => {
  it('prefers user_added_ts over rt_store_asset_mtime', () => {
    const a: any = { appid: 1, user_added_ts: 1000, rt_store_asset_mtime: 10 };
    const b: any = { appid: 2, user_added_ts: 500, rt_store_asset_mtime: 2000 };
    // a has newer user_added_ts → should sort first → compare < 0
    expect(compareByAdded(a, b)).toBeLessThan(0);
  });

  it('falls back to rt_store_asset_mtime when user_added_ts missing', () => {
    const a: any = { appid: 1, rt_store_asset_mtime: 300 };
    const b: any = { appid: 2, rt_store_asset_mtime: 200 };
    // a has newer mtime → a sorts first → compare < 0
    expect(compareByAdded(a, b)).toBeLessThan(0);
  });

  it('breaks ties by appid (descending) when both values missing', () => {
    const a: any = { appid: 1 };
    const b: any = { appid: 2 };
    // Tie-broken by `appIdOf(b) - appIdOf(a)` = 2 - 1 = 1.
    expect(compareByAdded(a, b)).toBe(1);
  });
});
