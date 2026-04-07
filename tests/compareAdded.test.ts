import { describe, it, expect } from 'vitest';
import { compareByAdded } from '../src/steam';

describe('compareByAdded', () => {
  it('prefers user_added_ts over rt_store_asset_mtime', () => {
    const a: any = { appid: 1, user_added_ts: 1000, rt_store_asset_mtime: 10 };
    const b: any = { appid: 2, user_added_ts: 500, rt_store_asset_mtime: 2000 };
    // a has newer user_added_ts -> should come first => compareByAdded(a,b) > 0
    expect(compareByAdded(a, b)).toBeGreaterThan(0);
  });

  it('falls back to rt_store_asset_mtime when user_added_ts missing', () => {
    const a: any = { appid: 1, rt_store_asset_mtime: 300 };
    const b: any = { appid: 2, rt_store_asset_mtime: 200 };
    expect(compareByAdded(a, b)).toBeLessThan(0); // bVal - aVal => 200-300 = -100 -> a should come after b
  });

  it('handles missing values as zero', () => {
    const a: any = { appid: 1 };
    const b: any = { appid: 2 };
    expect(compareByAdded(a, b)).toBe(0);
  });
});
