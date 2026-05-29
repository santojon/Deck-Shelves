import { describe, it, expect } from 'vitest'
import { normalizeTitleForMatch } from '../../steam/dedupe'

describe('normalizeTitleForMatch — cross-source title matching', () => {
  it('returns empty string for null / undefined / empty input', () => {
    expect(normalizeTitleForMatch(null)).toBe('')
    expect(normalizeTitleForMatch(undefined)).toBe('')
    expect(normalizeTitleForMatch('')).toBe('')
  })

  it('lowercases', () => {
    expect(normalizeTitleForMatch('HADES')).toBe('hades')
    expect(normalizeTitleForMatch('Hades')).toBe('hades')
  })

  it('strips trademark / copyright / registered marks', () => {
    expect(normalizeTitleForMatch('Hades™')).toBe('hades')
    expect(normalizeTitleForMatch('Hades®')).toBe('hades')
    expect(normalizeTitleForMatch('Hades©')).toBe('hades')
  })

  it('punctuation does not affect the match (the KCD regression case)', () => {
    // The local non-Steam shortcut name vs the Steam wishlist title.
    expect(normalizeTitleForMatch('Kingdom Come Deliverance'))
      .toBe(normalizeTitleForMatch('Kingdom Come: Deliverance'))
  })

  it('hyphens / underscores collapse to whitespace', () => {
    expect(normalizeTitleForMatch('half-life'))
      .toBe(normalizeTitleForMatch('half life'))
    expect(normalizeTitleForMatch('half_life'))
      .toBe(normalizeTitleForMatch('half life'))
  })

  it('preserves a series suffix so II / 2 / III still differ from the base title', () => {
    expect(normalizeTitleForMatch('Kingdom Come: Deliverance'))
      .not.toBe(normalizeTitleForMatch('Kingdom Come: Deliverance II'))
    expect(normalizeTitleForMatch('Doom'))
      .not.toBe(normalizeTitleForMatch('Doom 2'))
  })

  it('keeps accented letters distinct from their unaccented form', () => {
    // Locale-specific titles are not over-aggressively normalised.
    expect(normalizeTitleForMatch('Hadès'))
      .not.toBe(normalizeTitleForMatch('Hades'))
  })

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeTitleForMatch('   Hades   ')).toBe('hades')
    expect(normalizeTitleForMatch('Hades:   The Game')).toBe('hades the game')
  })

  it('handles parentheses / brackets', () => {
    expect(normalizeTitleForMatch('Hades (Game of the Year)'))
      .toBe('hades game of the year')
    expect(normalizeTitleForMatch('Hades [GOTY]'))
      .toBe('hades goty')
  })

  it('numeric titles stay numeric', () => {
    expect(normalizeTitleForMatch('112 Operator')).toBe('112 operator')
    expect(normalizeTitleForMatch('20 Minutes Till Dawn')).toBe('20 minutes till dawn')
  })
})
