import { describe, it, expect, vi } from 'vitest'

vi.mock('../../components/qam/modals/ConfirmActionModal', () => ({ confirmAction: vi.fn() }))
vi.mock('../../components/notify', () => ({ notify: vi.fn() }))

import { DESCRIPTION_SIZE_GROUP, LOGO_SIZE_GROUP, groupPatch, isGroupSet } from '../../components/qam/common/globalVisualGroups'
import { createGlobalVisualActions } from '../../features/settings/controller/globalVisual'

describe('global slider groups: same on every shelf vs per shelf', () => {
  it('a group counts as set when any of its values is a number', () => {
    expect(isGroupSet({ globalLogoSize: null, globalLogoTopOffset: null }, LOGO_SIZE_GROUP)).toBe(false)
    expect(isGroupSet({ globalLogoTopOffset: 70 }, LOGO_SIZE_GROUP)).toBe(true)
    expect(isGroupSet({}, DESCRIPTION_SIZE_GROUP)).toBe(false)
  })

  it('turning a group on keeps set values and writes what the sliders show for the rest', () => {
    expect(groupPatch({ globalLogoTopOffset: 70 }, LOGO_SIZE_GROUP, true)).toEqual({ globalLogoSize: 100, globalLogoTopOffset: 70 })
    expect(groupPatch({}, DESCRIPTION_SIZE_GROUP, true)).toEqual({ globalDescriptionScale: 100, globalDescriptionHeight: 2, globalDescriptionLogoGap: 8 })
  })

  it('turning a group off hands every value back to the shelves', () => {
    expect(groupPatch({ globalLogoSize: 150, globalLogoTopOffset: 70 }, LOGO_SIZE_GROUP, false)).toEqual({ globalLogoSize: null, globalLogoTopOffset: null })
  })
})

describe('global visual actions write null and several values in one save', () => {
  function actions(initial: Record<string, unknown>) {
    let live: any = { ...initial }
    const persist = vi.fn(async (next: any) => { live = next; return true })
    return { a: createGlobalVisualActions({ liveSettings: () => live, persist }), persist, get: () => live }
  }

  it('a position set back to per shelf is stored as null', async () => {
    const { a, get } = actions({ globalGameNamePosition: 'center' })
    await a.setGlobalGameNamePosition(null)
    expect(get().globalGameNamePosition).toBeNull()
  })

  it('a group patch is one save, and a no-op patch saves nothing', async () => {
    const { a, persist, get } = actions({ globalLogoSize: 150, globalLogoTopOffset: 70 })
    await a.setGlobalVisualValues({ globalLogoSize: null, globalLogoTopOffset: null })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(get()).toMatchObject({ globalLogoSize: null, globalLogoTopOffset: null })
    await a.setGlobalVisualValues({ globalLogoSize: null, globalLogoTopOffset: null })
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
