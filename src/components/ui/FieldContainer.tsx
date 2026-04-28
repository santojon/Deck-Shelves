import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * The shared container used inside `Tabs` tab-content regions — sets the
 * 24px horizontal padding that aligns with Decky's `Field` negative
 * margins so extended-width fields hit the container edge cleanly.
 *
 * Pass `scrollable` to cap height and enable vertical scroll (Source /
 * Visual tabs). When scrollable, a `focusin` handler scrolls the focused
 * descendant into view on the nearest edge — so gamepad navigation to the
 * last item lands the item fully visible instead of clipping it at the
 * bottom of the container.
 */
export function FieldContainer({
  children,
  scrollable = false,
  style,
}: {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollable) return
    const el = ref.current
    if (!el) return
    // Vertical-only padding around the focused target so its decorations
    // (Decky focus glow, the 2px green selected outline on highlight mini-
    // cards) don't get clipped at the FieldContainer's overflow edge. Tuned
    // to fit the largest of those (~28px of glow extending below).
    const FOCUS_VERTICAL_PAD = 32
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target || !el.contains(target)) return
      // rAF so the browser's own layout settles (some Decky fields mount
      // a child element AFTER focus lands on their wrapper).
      requestAnimationFrame(() => {
        try {
          // `target.scrollIntoView({ block: 'nearest' })` bails when the
          // nearest scroll container reports "already visible" — but a
          // grand-child inside an overflow:hidden row (e.g. a highlight
          // mini-card inside HighlightRow) trips that test even when the
          // outer FieldContainer is the one actually clipping. We compute
          // the FC-relative gap directly and adjust scrollTop so the
          // focused element plus a fixed FOCUS_VERTICAL_PAD stays inside
          // the visible window. scroll-margin-bottom on the inner element
          // is unreliable for the same reason — the algorithm looks only
          // at the nearest container.
          const targetRect = target.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const overflowBottom = (targetRect.bottom + FOCUS_VERTICAL_PAD) - elRect.bottom
          const overflowTop = elRect.top - (targetRect.top - FOCUS_VERTICAL_PAD)
          if (overflowBottom > 0) {
            el.scrollTop += overflowBottom
          } else if (overflowTop > 0) {
            el.scrollTop -= overflowTop
          }
        } catch {}
      })
    }
    el.addEventListener('focusin', onFocusIn)
    return () => { el.removeEventListener('focusin', onFocusIn) }
  }, [scrollable])

  // Decky's Field component uses width: 100%+84px with margin: -42px each
  // side — designed for parent containers with 42px h-padding (matches the
  // Tabs panel's own 41.95px). With our prior 24px padding, the field's
  // negative margin pushed content 18px past our edge on each side. In
  // non-scrollable mode (overflow:visible) that just spilled visually; in
  // scrollable mode (overflowX:hidden) the right edge was CLIPPED, making
  // Source/Visual tabs look "narrower" than Filters/Display. 42px aligns
  // with Decky's expectation so fields render flush within FC bounds.
  const base: CSSProperties = {
    // Bottom padding (when scrollable) extends the scrollable area so
    // `scrollIntoView({ block: 'nearest' })` honoring `scrollMarginBottom`
    // on focused cards can actually scroll the FC enough to reveal the 2px
    // selected-card outline / focus glow that renders below the card's
    // bounding box. Without this padding the FC could be at scrollMax with
    // the focused card flush against the visible bottom edge — the outline
    // (2px) and any external glow get clipped by the overflow:auto cut-off.
    padding: scrollable ? '0 42px 36px' : '0 42px',
    boxSizing: 'border-box',
    ...(scrollable ? { maxHeight: 'min(calc(100vh - 280px), 660px)', overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div ref={ref} className='field-item-container' style={base}>{children}</div>
}
