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

  const base: CSSProperties = {
    padding: '0 24px',
    boxSizing: 'border-box',
    ...(scrollable ? { maxHeight: 370, overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div ref={ref} className='field-item-container' style={base}>{children}</div>
}
