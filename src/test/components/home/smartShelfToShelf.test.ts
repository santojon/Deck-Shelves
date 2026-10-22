// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../store/settingsStore', async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => null }))

import { computeEnabledSmartShelves } from '../../../components/home/homeInjectHelpers'

const smart = (over: Record<string, unknown> = {}) =>
  ({ id: 'smart-1', title: 'Roulette', mode: 'random_pick', enabled: true, hidden: false, limit: 10, ...over }) as any

describe('smart shelf conversion for Home', () => {
  it('carries hiddenAppIds (next to manualOrder) so the resolver drops the games hidden from the shelf', () => {
    const [shelf] = computeEnabledSmartShelves([smart({ hiddenAppIds: [220, 440], manualOrder: [440] })]) as any[]
    expect(shelf.id).toBe('smart-1')
    expect(shelf.hiddenAppIds).toEqual([220, 440])
    expect(shelf.manualOrder).toEqual([440])
  })

  it('leaves hiddenAppIds unset when the smart shelf has none', () => {
    const [shelf] = computeEnabledSmartShelves([smart()]) as any[]
    expect(shelf.hiddenAppIds).toBeUndefined()
  })
})
