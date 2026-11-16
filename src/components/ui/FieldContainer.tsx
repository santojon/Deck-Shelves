import { useEffect, useRef, type CSSProperties } from 'react'

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
    const FOCUS_VERTICAL_PAD = 32
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target || !el.contains(target)) return
      requestAnimationFrame(() => {
        try {
          // scrollIntoView({block:'nearest'}) bails inside overflow-hidden ancestors.
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

  // Fields use width 100%+84px with margin -42px, so the parent carries 42px side padding.
  const base: CSSProperties = {
    padding: scrollable ? '0 42px 36px' : '0 42px',
    boxSizing: 'border-box',
    ...(scrollable ? { maxHeight: 'min(calc(100vh - 190px), 500px)', overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div ref={ref} className='deck-shelves-editor-fields' style={base}>{children}</div>
}
