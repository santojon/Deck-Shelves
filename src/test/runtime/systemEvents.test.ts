import { describe, it, expect, beforeEach, vi } from 'vitest'

const { calls } = vi.hoisted(() => ({
  calls: { invalidate: 0, pause: 0, resume: 0, refreshDisplay: 0, refreshController: 0, refreshBattery: 0 },
}))

vi.mock('../../steam', () => ({ invalidateAppOverviewCache: () => { calls.invalidate++ } }))
vi.mock('../../core/shelfRefresh', () => ({
  pauseShelfRefresh: () => { calls.pause++ },
  resumeShelfRefresh: () => { calls.resume++ },
}))
vi.mock('../../runtime/deviceState', () => ({
  refreshDisplay: async () => { calls.refreshDisplay++ },
  refreshControllerState: () => { calls.refreshController++ },
}))
vi.mock('../../runtime/batteryState', () => ({ forceBatteryRefresh: () => { calls.refreshBattery++ } }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {} }))

import { installSystemEvents } from '../../runtime/systemEvents'

describe('installSystemEvents — suspend/resume', () => {
  beforeEach(() => {
    calls.invalidate = 0; calls.pause = 0; calls.resume = 0
    calls.refreshDisplay = 0; calls.refreshController = 0; calls.refreshBattery = 0
    delete (globalThis as any).SteamClient
  })

  it('resume forces fresh display/controller/battery reads — none of these fire an event for a change that happened while asleep', () => {
    let handler: ((e: any) => void) | undefined
    ;(globalThis as any).SteamClient = {
      System: {
        RegisterForSuspendResumeEvents: (cb: (e: any) => void) => { handler = cb; return { unregister: () => {} } },
      },
    }
    const cleanup = installSystemEvents()
    handler?.({ bSuspending: true })
    expect(calls.pause).toBe(1)
    expect(calls.refreshDisplay).toBe(0) // not on suspend — only resume needs a re-check
    expect(calls.refreshController).toBe(0)
    expect(calls.refreshBattery).toBe(0)
    handler?.({ bSuspending: false })
    expect(calls.resume).toBe(1)
    expect(calls.refreshDisplay).toBe(1)
    expect(calls.refreshController).toBe(1)
    expect(calls.refreshBattery).toBe(1)
    cleanup()
  })

  it('a resume event with no prior suspend is a no-op (isSuspended guard)', () => {
    let handler: ((e: any) => void) | undefined
    ;(globalThis as any).SteamClient = {
      System: {
        RegisterForSuspendResumeEvents: (cb: (e: any) => void) => { handler = cb; return { unregister: () => {} } },
      },
    }
    const cleanup = installSystemEvents()
    handler?.({ bSuspending: false })
    expect(calls.resume).toBe(0)
    expect(calls.refreshDisplay).toBe(0)
    expect(calls.refreshController).toBe(0)
    expect(calls.refreshBattery).toBe(0)
    cleanup()
  })
})
