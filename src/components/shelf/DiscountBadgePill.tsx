import i18n from '../../i18n'
import { discountBadgeText, type DiscountBadgeMode } from './discountBadge'

let cutFormat: { lang: string; format: Intl.NumberFormat } | null = null

// "-50%" in the interface language's own percent format.
export function shortCutText(discount: number): string {
  const lang = i18n.language || 'en'
  try {
    if (cutFormat?.lang !== lang) cutFormat = { lang, format: new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }) }
    return cutFormat.format.format(-discount / 100)
  } catch {
    return `-${discount}%`
  }
}

// With both, the pill splits in the chosen order: the cut on the badge's green, the price on a darker part.
export function DiscountBadgePill({ mode, discount, priceText, percentText }: { mode: DiscountBadgeMode; discount: number; priceText?: string; percentText: string }) {
  if ((mode === 'both' || mode === 'percent_price') && priceText) {
    const cut = <span key='cut'>{shortCutText(discount)}</span>
    const price = <span key='price' className='ds-new-badge__price'>{priceText}</span>
    return (
      <div className="ds-new-badge ds-new-badge--split" style={{ background: '#2a7f2a' }}>
        {mode === 'both' ? [price, cut] : [cut, price]}
      </div>
    )
  }
  return <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>{discountBadgeText(mode, priceText, percentText)}</div>
}
