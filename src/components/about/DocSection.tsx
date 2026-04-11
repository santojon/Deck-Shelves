import React from 'react'
import { Focusable, scrollPanelClasses } from '@decky/ui'

export function DocSection({ children }: { children: React.ReactNode }) {
  return (
    <Focusable
      noFocusRing
      focusWithinClassName="gpfocuswithin"
      className={scrollPanelClasses?.ScrollPanel ?? ''}
      style={{
        padding: '16px 20px',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        outline: 'none',
      }}
      tabIndex={0}
    >
      <Focusable noFocusRing flow-children="column" style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </Focusable>
    </Focusable>
  )
}
