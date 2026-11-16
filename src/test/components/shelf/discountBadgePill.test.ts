import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DiscountBadgePill } from '../../../components/shelf/DiscountBadgePill'

const render = (mode: any, priceText?: string) =>
  renderToStaticMarkup(h(DiscountBadgePill, { mode, discount: 50, priceText, percentText: '50% off' }))

describe('discount badge pill', () => {
  it('splits both into the cut and the price, in the chosen order, with the price on the darker part', () => {
    const priceFirst = render('both', '$4.99')
    const cutFirst = render('percent_price', '$4.99')
    expect(priceFirst).toContain('ds-new-badge--split')
    expect(priceFirst.indexOf('$4.99')).toBeLessThan(priceFirst.indexOf('50%'))
    expect(cutFirst.indexOf('50%')).toBeLessThan(cutFirst.indexOf('$4.99'))
    expect(cutFirst).toContain('<span class="ds-new-badge__price">$4.99</span>')
    expect(cutFirst).not.toContain('off')
  })

  it('shows one text for the discount or the price alone, and the discount when the price is unknown', () => {
    expect(render('percent', '$4.99')).toContain('>50% off<')
    expect(render('price', '$4.99')).toContain('>$4.99<')
    expect(render('both')).toContain('>50% off<')
    expect(render('both')).not.toContain('ds-new-badge--split')
  })
})
