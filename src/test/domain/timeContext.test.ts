import { describe, it, expect } from 'vitest'
import { evalTimeContextRule, isTimeContextKind, TIME_CONTEXT_KINDS } from '../../domain/timeContext'

// Helper: a Date at a given local weekday/hour/month/day.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h, 0, 0)

describe('evalTimeContextRule', () => {
  it('weekend: matches Sat/Sun by default, weekday inverts', () => {
    const sat = at(2026, 6, 11) // 2026-07-11 is a Saturday
    const mon = at(2026, 6, 13) // Monday
    expect(evalTimeContextRule({ kind: 'weekend' }, sat)).toBe(true)
    expect(evalTimeContextRule({ kind: 'weekend' }, mon)).toBe(false)
    expect(evalTimeContextRule({ kind: 'weekend', value: 'weekday' }, mon)).toBe(true)
    expect(evalTimeContextRule({ kind: 'weekend', value: 'weekday' }, sat)).toBe(false)
  })

  it('timeOfDayPeriod: morning/afternoon/evening/night incl. midnight wrap', () => {
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'morning' }, at(2026, 0, 1, 8))).toBe(true)
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'morning' }, at(2026, 0, 1, 14))).toBe(false)
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'afternoon' }, at(2026, 0, 1, 14))).toBe(true)
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'evening' }, at(2026, 0, 1, 19))).toBe(true)
    // night wraps past midnight: 22h and 3h both match, 12h does not
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'night' }, at(2026, 0, 1, 22))).toBe(true)
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'night' }, at(2026, 0, 1, 3))).toBe(true)
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'night' }, at(2026, 0, 1, 12))).toBe(false)
  })

  it('timeOfDayPeriod: unknown period fails open', () => {
    expect(evalTimeContextRule({ kind: 'timeOfDayPeriod', period: 'nope' }, at(2026, 0, 1, 3))).toBe(true)
  })

  it('season: month-based, hemisphere-aware', () => {
    const jul = at(2026, 6, 1) // July
    expect(evalTimeContextRule({ kind: 'season', season: 'summer' }, jul)).toBe(true) // north
    expect(evalTimeContextRule({ kind: 'season', season: 'winter' }, jul)).toBe(false)
    expect(evalTimeContextRule({ kind: 'season', season: 'winter', hemisphere: 'south' }, jul)).toBe(true)
    const jan = at(2026, 0, 1)
    expect(evalTimeContextRule({ kind: 'season', season: 'winter' }, jan)).toBe(true) // north
    expect(evalTimeContextRule({ kind: 'season', season: 'summer', hemisphere: 'south' }, jan)).toBe(true)
  })

  it('season: no season set fails open', () => {
    expect(evalTimeContextRule({ kind: 'season' }, at(2026, 6, 1))).toBe(true)
  })

  it('holiday: MM-DD ranges incl. year-end wrap; empty fails open', () => {
    const xmas = { kind: 'holiday', ranges: [{ start: '12-20', end: '12-31' }] }
    expect(evalTimeContextRule(xmas, at(2026, 11, 25))).toBe(true) // Dec 25
    expect(evalTimeContextRule(xmas, at(2026, 11, 5))).toBe(false) // Dec 5
    const newYear = { kind: 'holiday', ranges: [{ start: '12-27', end: '01-02' }] }
    expect(evalTimeContextRule(newYear, at(2026, 11, 31))).toBe(true) // Dec 31
    expect(evalTimeContextRule(newYear, at(2026, 0, 1))).toBe(true) // Jan 1
    expect(evalTimeContextRule(newYear, at(2026, 5, 15))).toBe(false) // Jun 15
    expect(evalTimeContextRule({ kind: 'holiday', ranges: [] }, at(2026, 5, 15))).toBe(true)
  })

  it('unknown kind fails open', () => {
    expect(evalTimeContextRule({ kind: 'nope' }, at(2026, 0, 1))).toBe(true)
  })

  it('isTimeContextKind recognises the time kinds only', () => {
    for (const k of TIME_CONTEXT_KINDS) expect(isTimeContextKind(k)).toBe(true)
    expect(isTimeContextKind('battery')).toBe(false)
    expect(isTimeContextKind('timeWindow')).toBe(false)
  })
})
