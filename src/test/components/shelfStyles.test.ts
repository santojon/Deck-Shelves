// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { clampCardGap } from '../../components/shelf/shelfStyles'

describe('clampCardGap', () => {
  it('floors a near-zero gap to 8px (TiltedHome skew guard)', () => {
    expect(clampCardGap(0, 134)).toBe(8)
    expect(clampCardGap(2, 134)).toBe(8)
  })

  it('passes a normal measured gap through unchanged', () => {
    expect(clampCardGap(11, 134)).toBe(11)
    expect(clampCardGap(12, 134)).toBe(12)
  })

  it('caps a bogus/huge measured gap at half the card width', () => {
    expect(clampCardGap(9999, 134)).toBe(67)
    expect(clampCardGap(300, 134)).toBe(67)
  })

  it('scales the ceiling with card width (native-size matching uses a measured width)', () => {
    expect(clampCardGap(9999, 200)).toBe(100)
  })
})

describe('removeGlobalStyles', () => {
  it('takes the row stylesheet and the root variables out of the page', async () => {
    const { removeGlobalStyles } = await import('../../components/shelf/shelfStyles')
    const style = document.createElement('style')
    style.id = 'deck-shelves-row-style'
    document.head.appendChild(style)
    document.documentElement.style.setProperty('--ds-card-radius', '4px')
    document.documentElement.style.setProperty('--ds-native-card-w', '134px')
    removeGlobalStyles()
    expect(document.getElementById('deck-shelves-row-style')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--ds-card-radius')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--ds-native-card-w')).toBe('')
  })
})
