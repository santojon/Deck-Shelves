import type { CSSProperties } from 'react'

/**
 * The shared container used inside `Tabs` tab-content regions — sets the
 * 24px horizontal padding that aligns with Decky's `Field` negative
 * margins so extended-width fields hit the container edge cleanly.
 *
 * Pass `scrollable` to cap height at 400px and enable vertical scroll
 * (used for Source / Visual tabs in the edit modals). Leave it off for
 * short tabs like Display or Filters.
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
  const base: CSSProperties = {
    padding: '0 24px',
    boxSizing: 'border-box',
    ...(scrollable ? { maxHeight: 370, overflowY: 'auto', overflowX: 'hidden' } : {}),
    ...style,
  }
  return <div className='field-item-container' style={base}>{children}</div>
}
