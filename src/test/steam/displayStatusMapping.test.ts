import { describe, it, expect } from 'vitest'
import { normalizeAppOverview, evaluateFilterGroup, type AppOverview } from '../../steam'
import type { FilterGroup } from '../../types'

const raw = (appid: number, display_status: number, extra: Record<string, unknown> = {}) =>
  ({ appid, display_name: `App ${appid}`, per_client_data: [{ clientid: '0', installed: true, display_status, status_percentage: 0, ...extra }] })

const statusGroup = (groups: string[]): FilterGroup =>
  ({ mode: 'and', items: [{ type: 'appStatus', inverted: false, params: { groups } }] } as unknown as FilterGroup)

const matches = (apps: AppOverview[], g: FilterGroup) => evaluateFilterGroup(g, apps).map((a) => a.appid)

// Steam's own values: 19 UpdateQueued, 20 UpdateRequired, 18 UpdatePaused, 6 Updating, 7 Downloading,
// 11 ReadyToLaunch, 12 RegionRestricted, 13 PresaleOnly.
describe('display status from Steam, as the filters read it', () => {
  it('a queued, required or paused update is an update pending; an idle, region-locked or presale game is not', () => {
    const pending = [19, 20, 18, 6].map((ds, i) => normalizeAppOverview(raw(100 + i, ds)) as AppOverview)
    const idle = [11, 12, 13].map((ds, i) => normalizeAppOverview(raw(200 + i, ds)) as AppOverview)
    for (const a of pending) expect(a.update_pending, `ds=${a.display_status}`).toBe(true)
    for (const a of idle) expect(a.update_pending, `ds=${a.display_status}`).not.toBe(true)
  })

  it('the status groups pick the right apps', () => {
    const apps = [19, 18, 7, 6, 12, 13, 11].map((ds) => normalizeAppOverview(raw(ds, ds)) as AppOverview)
    expect(matches(apps, statusGroup(['update_queued']))).toEqual([19])
    expect(matches(apps, statusGroup(['update_paused']))).toEqual([18])
    expect(matches(apps, statusGroup(['queued']))).toEqual([19, 18])
    expect(matches(apps, statusGroup(['downloading']))).toEqual([7, 6])
    expect(matches(apps, statusGroup(['committing', 'staging']))).toEqual([6])
    expect(matches(apps, statusGroup(['installed_idle']))).toEqual([11])
  })
})
