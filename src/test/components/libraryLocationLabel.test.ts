import { afterEach, describe, expect, it } from 'vitest'
import { libraryLabel } from '../../components/conditions/LibraryLocationFields'
import { STEAM_EN, STEAM_PT_BR, clearSteamLocalizer, stubSteamLocalizer } from '../fixtures/steamLocalizer'

const lib = (over: Record<string, unknown>) => ({ id: 'b', label: '842f2ed3-0000', path: '/run/media/deck/842f2ed3-0000', category: 'external', mounted: true, named: false, sdCard: true, ...over }) as any

afterEach(() => clearSteamLocalizer())

describe('library location label', () => {
  it('an unnamed SD card shows Steam\'s own text in the user language', () => {
    stubSteamLocalizer(STEAM_PT_BR, STEAM_EN)
    expect(libraryLabel(lib({}))).toBe('Cartão microSD')
  })

  it('a named library keeps its name', () => {
    stubSteamLocalizer(STEAM_PT_BR, STEAM_EN)
    expect(libraryLabel(lib({ named: true, label: 'Games' }))).toBe('Games')
  })

  it('a drive that is not the card keeps the folder name', () => {
    stubSteamLocalizer(STEAM_PT_BR, STEAM_EN)
    expect(libraryLabel(lib({ sdCard: false }))).toBe('842f2ed3-0000')
  })

  it('without an answer from Steam the folder name stays', () => {
    stubSteamLocalizer({}, {})
    expect(libraryLabel(lib({}))).toBe('842f2ed3-0000')
  })
})
