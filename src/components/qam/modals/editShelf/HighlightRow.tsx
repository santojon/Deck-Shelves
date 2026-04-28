import { useEffect, useRef } from 'react'
import { Focusable } from '@decky/ui'
import { computeCenteredScrollLeft } from '../../../../core/scrollUtils'

/**
 * Horizontal scrollable row that auto-centers the focused mini-card.
 *
 * Used by the Visual tab preview. Extends past the container's horizontal
 * padding with `margin: 0 -24px` so the first/last card align with the
 * Decky Field content above (which has matching negative margins), then
 * insets content with `padding: 0 24px` so cards don't butt against the
 * container edges.
 */
export function HighlightRow({ children }: { children: React.ReactNode }) {
  const rowRef = useRef<HTMLDivElement | null>(null)

  // Re-center the focused card when card sizes change (e.g. toggling a card
  // to featured widens it from 68px to 210px and shifts neighbors). The
  // `focusin` listener below handles initial focus moves, but a width
  // change doesn't fire focusin — so the focused card can slide out of
  // view. This effect runs on every render (children prop change) and
  // re-centers if focus is inside the row.
  useEffect(() => {
    const rowEl = rowRef.current
    if (!rowEl) return
    const focused = rowEl.querySelector<HTMLElement>('.ds-highlight-mini.gpfocus')
      ?? rowEl.querySelector<HTMLElement>('.ds-highlight-mini:focus')
    if (!focused) return
    const final = computeCenteredScrollLeft(
      { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
      { left: focused.offsetLeft, top: focused.offsetTop, width: focused.offsetWidth, height: focused.offsetHeight }
    )
    try { rowEl.scrollTo({ left: final, behavior: 'smooth' }) } catch { rowEl.scrollLeft = final }
  })

  useEffect(() => {
    const rowEl = rowRef.current
    if (!rowEl) return

    let rafPending: number | null = null
    let throttleTimer: any = null
    let throttled = false
    let lastFocusedCard: HTMLElement | null = null

    const doScroll = (card: HTMLElement) => {
      const final = computeCenteredScrollLeft(
        { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
        { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight }
      )
      try { rowEl.scrollTo({ left: final, behavior: 'instant' as ScrollBehavior }) } catch { rowEl.scrollLeft = final }
      throttled = true
      if (throttleTimer) clearTimeout(throttleTimer)
      throttleTimer = setTimeout(() => {
        throttled = false
        throttleTimer = null
        if (lastFocusedCard && lastFocusedCard !== card) doScroll(lastFocusedCard)
      }, 100)
    }

    const handle = (card: HTMLElement | null) => {
      if (!card) return
      lastFocusedCard = card
      if (throttled) return
      doScroll(card)
    }

    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-highlight-mini') as HTMLElement | null
      if (!card || !rowEl.contains(card)) return
      if (rafPending !== null) cancelAnimationFrame(rafPending)
      rafPending = requestAnimationFrame(() => { rafPending = null; handle(card) })
    }

    rowEl.addEventListener('focusin', onFocusIn)
    return () => {
      rowEl.removeEventListener('focusin', onFocusIn)
      if (rafPending !== null) cancelAnimationFrame(rafPending)
      if (throttleTimer) clearTimeout(throttleTimer)
    }
  }, [])

  return (
    <Focusable
      ref={rowRef}
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
        // Extend to container outer edges with a negative horizontal margin
        // (matches Decky Field footprint). No internal horizontal padding
        // here so the first/last card sit flush against the edge.
        margin: '0 -24px', padding: '12px 0 28px', width: 'auto',
        // overflow-y: visible would let the focus glow escape vertically,
        // but Chromium computes overflow-y to auto whenever overflow-x is
        // auto/scroll/hidden — so a vertical scrollbar would briefly appear
        // on focus. Keep both axes clipped and reserve enough vertical
        // padding (28px below) for Steam's drop-shadow focus glow on the
        // mini-card, which extends ~24px past the card's bottom edge and
        // was being cut off when the row used 8px symmetric padding.
        overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box',
        // Horizontal scrolling should NOT drift vertically. `pan-x` tells
        // the browser this row owns horizontal pans; vertical gestures go
        // to the parent. `overscroll-behavior-*` stops scroll chaining
        // when the row hits its edge so the parent's `overflow-y: auto`
        // can't catch the remaining gesture and jitter.
        touchAction: 'pan-x',
        overscrollBehaviorX: 'contain',
        overscrollBehaviorY: 'none',
      }}
    >
      {children}
    </Focusable>
  )
}
