import { describe, it, expect, afterEach } from 'vitest'
import type { AppOverview } from '../../steam'
import { FilterItemTypeSchema } from '../../types'
import { ALL_FILTER_TYPES, canBeInverted } from '../../components/filter/utils'
import { FILTER_V3_EVALUATORS } from '../../steam/v3Extensions'

// evalFamilySharing reads the app overview from the global appStore, so mock it.
function mockAppStore(shareableIds: Set<number>) {
  ;(globalThis as any).appStore = {
    GetAppOverviewByAppID: (id: number) => ({ appid: id, family_sharing: shareableIds.has(id) }),
  }
}

const app = (appid: number): AppOverview => ({ appid, display_name: `App ${appid}` } as AppOverview)

afterEach(() => { delete (globalThis as any).appStore })

describe('familySharing filter — exposure', () => {
  it('is a valid schema type, listed in the picker, invertible, with a registered evaluator', () => {
    expect(FilterItemTypeSchema.options).toContain('familySharing')
    expect(ALL_FILTER_TYPES).toContain('familySharing')
    expect(canBeInverted('familySharing')).toBe(true)
    expect(typeof FILTER_V3_EVALUATORS.familySharing).toBe('function')
  })
})

describe('familySharing filter — evaluator', () => {
  const evalFamily = (id: number) => FILTER_V3_EVALUATORS.familySharing({ type: 'familySharing', params: {} } as any, app(id))

  it('matches a game flagged for family sharing', () => {
    mockAppStore(new Set([2]))
    expect(evalFamily(2)).toBe(true)
  })

  it('does not match a game that is not flagged', () => {
    mockAppStore(new Set([2]))
    expect(evalFamily(1)).toBe(false)
    expect(evalFamily(3)).toBe(false)
  })

  it('is fail-soft when the app overview is unavailable', () => {
    delete (globalThis as any).appStore
    expect(evalFamily(5)).toBe(false)
  })
})
