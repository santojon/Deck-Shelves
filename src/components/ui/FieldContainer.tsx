import type { CSSProperties } from 'react'

// No height or scroll of its own: the dialog scrolls, and moves with the focus.
export function FieldContainer({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    boxSizing: 'border-box',
    ...style,
  }
  return <div className='deck-shelves-editor-fields' style={base}>{children}</div>
}
