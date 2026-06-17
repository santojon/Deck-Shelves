import { describe, it, expect } from 'vitest';
import {
  resolveQuickLaunchAction,
  EAppDisplayStatus,
  UPDATE_ACTIVE_STATUSES,
  UPDATE_QUEUED_STATUSES,
} from '../../steam/appDisplayStatus';

describe('resolveQuickLaunchAction', () => {
  it('not-installed wins regardless of display_status', () => {
    expect(resolveQuickLaunchAction({ installed: false, displayStatus: EAppDisplayStatus.Running })).toBe('not_installed');
    expect(resolveQuickLaunchAction({ installed: false, displayStatus: 0 })).toBe('not_installed');
  });

  it('Launching / Running map to "running" (View → resume / raise window)', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Launching })).toBe('running');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Running })).toBe('running');
  });

  it('UpdateQueued maps to "update", NOT "pause" — regression for card with update pending showing the wrong View hint', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.UpdateQueued })).toBe('update');
  });

  it('UpdatePaused and Reconfiguring also map to "update"', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.UpdatePaused })).toBe('update');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Reconfiguring })).toBe('update');
  });

  it('actively progressing statuses map to "pause"', () => {
    for (const ds of UPDATE_ACTIVE_STATUSES) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('pause');
    }
  });

  it('Installing (first-time install in flight) maps to "pause"', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Installing })).toBe('pause');
  });

  it('all queued statuses map to "update" (never "pause")', () => {
    for (const ds of UPDATE_QUEUED_STATUSES) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('update');
    }
  });

  it('Uninstalling / Suspended statuses map to "uninstalling"', () => {
    for (const ds of [6, 14, 16]) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('uninstalling');
    }
  });

  it('Installed (11) and unknown statuses fall through to "play"', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Installed })).toBe('play');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: 0 })).toBe('play');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: 999 })).toBe('play');
  });

  it('UPDATE_ACTIVE_STATUSES and UPDATE_QUEUED_STATUSES never overlap', () => {
    const active = new Set(UPDATE_ACTIVE_STATUSES);
    for (const ds of UPDATE_QUEUED_STATUSES) {
      expect(active.has(ds), `ds=${ds} is in both active + queued sets — Steam's first menu item is ambiguous`).toBe(false);
    }
  });

  it('Downloading (ds=19) with status_percentage=0 maps to "update" (tool/runtime queued but not transferring)', () => {
    // Regression: Proton Hotfix appears with display_status=19 and
    // status_percentage=0 when an update is queued but the download
    // hasn't started. Steam's first menu item there is "Update".
    expect(
      resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Downloading, statusPercentage: 0 }),
    ).toBe('update');
  });

  it('Downloading (ds=19) with status_percentage>0 maps to "pause" (actively transferring)', () => {
    expect(
      resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Downloading, statusPercentage: 35 }),
    ).toBe('pause');
  });

  it('Downloading (ds=19) without status_percentage falls back to "pause" (legacy/unknown progress)', () => {
    expect(
      resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Downloading }),
    ).toBe('pause');
  });

  it('Validating / Staging / Committing also flip to "update" when status_percentage=0', () => {
    for (const ds of UPDATE_ACTIVE_STATUSES) {
      expect(
        resolveQuickLaunchAction({ installed: true, displayStatus: ds, statusPercentage: 0 }),
      ).toBe('update');
    }
  });

  it('Installing (ds=3) with status_percentage=0 also maps to "update" (queued install)', () => {
    expect(
      resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Installing, statusPercentage: 0 }),
    ).toBe('update');
  });
});
