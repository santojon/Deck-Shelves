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
    // Vertical pad so focused decorations (focus glow, the 2px green
    // highlight outline) don't get clipped at the FC's overflow edge.
    const FOCUS_VERTICAL_PAD = 32
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target || !el.contains(target)) return
      // rAF so layout settles before measuring.
      requestAnimationFrame(() => {
        try {
          // Native scrollIntoView({block:'nearest'}) bails inside
          // overflow-hidden ancestors; compute the FC-relative gap.
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

  // The host Field uses `width: 100%+84px; margin: -42px`. Parent must
  // carry 42px h-padding so fields render flush.
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
    ...(scrollable ? { maxHeight: 'min(calc(100vh - 190px), 500px)', overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div ref={ref} className='field-item-container' style={base}>{children}</div>
}
