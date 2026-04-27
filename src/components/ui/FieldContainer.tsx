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
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target || !el.contains(target)) return
      // rAF so the browser's own layout settles (some Decky fields mount
      // a child element AFTER focus lands on their wrapper). `block: 'nearest'`
      // is a no-op when the item is already visible and scrolls just enough
      // when it's clipped — exactly what we want for the last item case.
      requestAnimationFrame(() => {
        try { target.scrollIntoView({ block: 'nearest' }) } catch {}
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
    padding: '0 42px',
    boxSizing: 'border-box',
    ...(scrollable ? { maxHeight: 'min(calc(100vh - 280px), 660px)', overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div ref={ref} className='field-item-container' style={base}>{children}</div>
}
