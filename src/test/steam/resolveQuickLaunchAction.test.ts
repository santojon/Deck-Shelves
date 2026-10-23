import { describe, it, expect } from 'vitest';
import {
  resolveQuickLaunchAction,
  localQuickLaunchAction,
  EAppDisplayStatus,
  UPDATE_ACTIVE_STATUSES,
  UPDATE_QUEUED_STATUSES,
  UPDATE_PENDING_STATUSES,
  APP_STATUS_GROUPS,
} from '../../steam/appDisplayStatus';

describe('EAppDisplayStatus', () => {
  it("matches the values of Steam's own EDisplayStatus", () => {
    // Read from the client's enum (the protobuf EDisplayStatus) on a SteamOS Deck, 2026-10-23.
    expect(EAppDisplayStatus).toMatchObject({
      Invalid: 0, Launching: 1, Uninstalling: 2, Installing: 3, Running: 4, Validating: 5, Updating: 6,
      Downloading: 7, Synchronizing: 8, ReadyToInstall: 9, ReadyToPreload: 10, ReadyToLaunch: 11,
      UpdatePaused: 18, UpdateQueued: 19, UpdateRequired: 20, DownloadPaused: 22, DownloadQueued: 23,
      DownloadRequired: 24, Terminating: 36, DownloadFailed: 38, UpdateFailed: 39,
    });
    // One name per status: two names for one value read as two statuses.
    const values = Object.values(EAppDisplayStatus);
    expect(new Set(values).size).toBe(values.length);
  });

  it('an update that is required, queued, paused, running or failed is pending; a fresh download is not', () => {
    for (const ds of [6, 18, 19, 20, 39]) expect(UPDATE_PENDING_STATUSES).toContain(ds);
    for (const ds of [7, 22, 23, 24, 38, 11, 12, 13]) expect(UPDATE_PENDING_STATUSES).not.toContain(ds);
  });

  it('status groups never match region-restricted or presale apps', () => {
    for (const statuses of Object.values(APP_STATUS_GROUPS)) {
      expect(statuses).not.toContain(12);
      expect(statuses).not.toContain(13);
    }
  });
});

describe('resolveQuickLaunchAction', () => {
  it('not-installed wins regardless of display_status', () => {
    expect(resolveQuickLaunchAction({ installed: false, displayStatus: EAppDisplayStatus.Running })).toBe('not_installed');
    expect(resolveQuickLaunchAction({ installed: false, displayStatus: 0 })).toBe('not_installed');
  });

  it('Launching / Running map to "running" (View → resume / raise window)', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Launching })).toBe('running');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Running })).toBe('running');
  });

  it("a queued or required update maps to \"update\", as Steam's own menu starts with Update", () => {
    // Steam's game page shows Update for both, and a queued update (19) with no progress is the
    // usual state of a game or a Proton tool waiting for its update.
    for (const ds of [EAppDisplayStatus.UpdateQueued, EAppDisplayStatus.UpdateRequired]) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('update');
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds, statusPercentage: 0 })).toBe('update');
    }
  });

  it('a paused or failed update or download maps to "update" (Steam: Resume)', () => {
    for (const ds of [EAppDisplayStatus.UpdatePaused, EAppDisplayStatus.UpdateFailed, EAppDisplayStatus.DownloadPaused, EAppDisplayStatus.DownloadFailed]) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('update');
    }
  });

  it('all queued statuses map to "update" (never "pause")', () => {
    for (const ds of UPDATE_QUEUED_STATUSES) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('update');
    }
  });

  it('Updating and Downloading map to "pause", as Steam\'s own menu starts with Pause', () => {
    for (const ds of [EAppDisplayStatus.Updating, EAppDisplayStatus.Downloading]) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('pause');
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds, statusPercentage: 50 })).toBe('pause');
    }
  });

  it('Validating maps to "pause" only while bytes move', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Validating, statusPercentage: 40 })).toBe('pause');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Validating, statusPercentage: 0 })).toBe('update');
  });

  it('Installing (first-time install in flight) maps to "pause", and to "update" before it starts', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Installing })).toBe('pause');
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Installing, statusPercentage: 0 })).toBe('update');
  });

  it('Uninstalling maps to "uninstalling"', () => {
    expect(resolveQuickLaunchAction({ installed: true, displayStatus: EAppDisplayStatus.Uninstalling })).toBe('uninstalling');
  });

  it('ReadyToLaunch (11), Synchronizing, a game being stopped (Terminating) and unknown statuses fall through to "play"', () => {
    for (const ds of [EAppDisplayStatus.ReadyToLaunch, EAppDisplayStatus.Synchronizing, EAppDisplayStatus.Terminating, 0, 999]) {
      expect(resolveQuickLaunchAction({ installed: true, displayStatus: ds })).toBe('play');
    }
  });

  it('UPDATE_ACTIVE_STATUSES and UPDATE_QUEUED_STATUSES never overlap', () => {
    const active = new Set(UPDATE_ACTIVE_STATUSES);
    for (const ds of UPDATE_QUEUED_STATUSES) {
      expect(active.has(ds), `ds=${ds} is in both active + queued sets — Steam's first menu item is ambiguous`).toBe(false);
    }
  });
});

describe('localQuickLaunchAction', () => {
  it("reads this device's entry and passes its client id", () => {
    const overview = {
      installed: true,
      per_client_data: [
        { clientid: '0', installed: true, display_status: EAppDisplayStatus.UpdateQueued, status_percentage: 0 },
        { clientid: '77', installed: true, display_status: EAppDisplayStatus.ReadyToLaunch },
      ],
    };
    expect(localQuickLaunchAction(overview)).toEqual({ action: 'update', clientId: '0' });
  });

  it("a copy installed only on another client is not installed here", () => {
    const overview = { installed: true, per_client_data: [{ clientid: '77', installed: true, display_status: EAppDisplayStatus.ReadyToLaunch }] };
    expect(localQuickLaunchAction(overview).action).toBe('not_installed');
  });

  it('an overview without per-client data falls back to its own fields', () => {
    expect(localQuickLaunchAction({ installed: true, display_status: EAppDisplayStatus.ReadyToLaunch }).action).toBe('play');
    expect(localQuickLaunchAction({ installed: false }).action).toBe('not_installed');
  });
});
