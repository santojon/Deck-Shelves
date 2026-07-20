import { describe, it, expect, beforeEach } from 'vitest'
import { installSessionState, evalSessionRule, getSessionState, isSessionRuleKind } from '../../runtime/sessionState'

let lifetimeCb: ((n: any) => void) | null = null
let runningApps: number[] = []
let overviews: Record<number, any> = {}

beforeEach(() => {
  lifetimeCb = null
  runningApps = []
  overviews = {}
  ;(globalThis as any).SteamClient = {
    GameSessions: {
      RegisterForAppLifetimeNotifications: (cb: any) => { lifetimeCb = cb; return { unregister() {} } },
    },
  }
  ;(globalThis as any).appStore = { GetAppOverviewByAppID: (id: number) => overviews[id] ?? null }
  ;(globalThis as any).SteamUIStore = { get RunningApps() { return runningApps } }
})

describe('sessionState', () => {
  // Must run FIRST: module-level _lastApp starts null and later tests populate it.
  it('lastGameSource fails open when nothing has been launched yet', () => {
    installSessionState()
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'steam' })).toBe(true)
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'nonSteam' })).toBe(true)
  })

  it('lastGameSource records Steam vs non-Steam of the last started app', () => {
    overviews[100] = { app_type: 1 } // Steam game
    overviews[2147841299] = { app_type: 1073741824 } // non-Steam shortcut
    installSessionState()
    lifetimeCb!({ unAppID: 100, bRunning: true })
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'steam' })).toBe(true)
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'nonSteam' })).toBe(false)
    lifetimeCb!({ unAppID: 2147841299, bRunning: true })
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'nonSteam' })).toBe(true)
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'steam' })).toBe(false)
  })

  it('app stop (bRunning false) does not change the last-played source', () => {
    overviews[100] = { app_type: 1 }
    installSessionState()
    lifetimeCb!({ unAppID: 100, bRunning: true }) // steam started
    lifetimeCb!({ unAppID: 100, bRunning: false }) // stopped
    expect(evalSessionRule({ kind: 'lastGameSource', value: 'steam' })).toBe(true)
  })

  it('gameRunning reflects the live RunningApps length', () => {
    installSessionState()
    runningApps = []
    expect(evalSessionRule({ kind: 'gameRunning' })).toBe(false)
    runningApps = [123]
    expect(evalSessionRule({ kind: 'gameRunning' })).toBe(true)
    expect(getSessionState().gameRunning).toBe(true)
  })

  it('unknown kind fails open; isSessionRuleKind recognises session kinds only', () => {
    expect(evalSessionRule({ kind: 'nope' })).toBe(true)
    expect(isSessionRuleKind('lastGameSource')).toBe(true)
    expect(isSessionRuleKind('gameRunning')).toBe(true)
    expect(isSessionRuleKind('battery')).toBe(false)
  })
})
