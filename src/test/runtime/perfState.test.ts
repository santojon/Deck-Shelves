import { describe, it, expect, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: { current: null as any } }))
vi.mock('../../runtime/host/decky', () => ({ call: async () => rpc.current }))

import { evalPerfRule, getPerfSnapshot, isPerfRuleKind } from '../../runtime/perfState'

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('perfState (on-demand, no timer)', () => {
  it('fails open before any snapshot is fetched', async () => {
    expect(evalPerfRule({ kind: 'highCpu', above: 80 })).toBe(true)
    expect(evalPerfRule({ kind: 'lowMemory', below: 15 })).toBe(true)
    await settle()
  })

  it('evaluates highCpu / lowMemory once a snapshot arrives', async () => {
    rpc.current = { cpuPercent: 90, memAvailablePercent: 10, supported: true }
    evalPerfRule({ kind: 'highCpu' })
    await settle()
    expect(getPerfSnapshot()).toEqual({ cpuPercent: 90, memAvailablePercent: 10, supported: true })
    expect(evalPerfRule({ kind: 'highCpu', above: 80 })).toBe(true)
    expect(evalPerfRule({ kind: 'highCpu', above: 95 })).toBe(false)
    expect(evalPerfRule({ kind: 'lowMemory', below: 15 })).toBe(true)
    expect(evalPerfRule({ kind: 'lowMemory', below: 5 })).toBe(false)
  })

  it('lowFrameBudget fails open while warming up (no samples yet)', () => {
    expect(evalPerfRule({ kind: 'lowFrameBudget', belowFps: 45 })).toBe(true)
  })

  it('unknown kind fails open; isPerfRuleKind recognises perf kinds only', () => {
    expect(evalPerfRule({ kind: 'nope' })).toBe(true)
    expect(isPerfRuleKind('highCpu')).toBe(true)
    expect(isPerfRuleKind('lowMemory')).toBe(true)
    expect(isPerfRuleKind('lowFrameBudget')).toBe(true)
    expect(isPerfRuleKind('battery')).toBe(false)
  })
})
