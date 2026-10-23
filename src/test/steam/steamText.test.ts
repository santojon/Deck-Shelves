import { describe, it, expect, afterEach, vi } from 'vitest'
import { STEAM_TEXT, matchesSteamText, steamText, steamTextSelectors } from '../../steam/steamText'
import { STEAM_PT_BR, clearSteamLocalizer, stubSteamLocalizer } from '../fixtures/steamLocalizer'

describe('steamText', () => {
  afterEach(clearSteamLocalizer)

  it("gives Steam's strings for a name, user's language first, lower-cased and without repeats", () => {
    stubSteamLocalizer(STEAM_PT_BR)
    expect(steamText('recentGames')).toEqual(['jogos recentes', 'recent games', 'jogo atual', 'current game'])
    expect(steamText('homeTabs', 'user')).toEqual(['novidades', 'amigos', 'recomendados'])
    expect(steamText('closeButton', 'english')).toEqual(['close', 'cancel'])
  })

  it("covers the current-game row the beta client shows above the mount in Big Art mode", () => {
    expect(STEAM_TEXT.recentGames).toContain('#Showcase_CurrentGame')
    stubSteamLocalizer(STEAM_PT_BR)
    expect(matchesSteamText('Jogo atual', 'recentGames', 'exact')).toBe(true)
    expect(matchesSteamText('Current Game', 'recentGames', 'exact')).toBe(true)
  })

  it('has nothing to match without a localizer, and skips unknown or raw tokens', () => {
    expect(steamText('recentGames')).toEqual([])
    vi.stubGlobal('LocalizationManager', { LocalizeString: (t: string) => t, LocalizeStringFromFallback: () => null })
    expect(steamText('homeTabs')).toEqual([])
  })

  it('reads a name again until Steam knows its tokens, then keeps the answer', () => {
    expect(steamText('homeTabs')).toEqual([])
    stubSteamLocalizer(STEAM_PT_BR)
    const known = steamText('homeTabs')
    expect(known.length).toBe(6)
    vi.unstubAllGlobals()
    expect(steamText('homeTabs')).toBe(known)
  })

  it('matches whole or contained text, ignoring case and surrounding spaces', () => {
    stubSteamLocalizer(STEAM_PT_BR)
    expect(matchesSteamText('  Amigos ', 'homeTabs', 'exact')).toBe(true)
    expect(matchesSteamText('Amigos online', 'homeTabs', 'exact')).toBe(false)
    expect(matchesSteamText('Jogos recentes Hades', 'recentGames', 'contains')).toBe(true)
  })

  it('builds one selector per string, escaping quotes', () => {
    stubSteamLocalizer({ '#Button_Close': 'Close "now"' }, {})
    expect(steamTextSelectors('closeButton', 'aria-label', 'exact')).toEqual(['[aria-label="close \\"now\\"" i]'])
    stubSteamLocalizer(STEAM_PT_BR)
    expect(steamTextSelectors('recentGames', 'aria-label', 'contains', ' .Focusable', 'user')).toEqual(['[aria-label*="jogos recentes" i] .Focusable', '[aria-label*="jogo atual" i] .Focusable'])
  })

  it('names only tokens, never translated words', () => {
    for (const tokens of Object.values(STEAM_TEXT)) for (const token of tokens) expect(token.startsWith('#')).toBe(true)
  })
})
