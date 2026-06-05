import React from 'react'
import { DialogBody, DialogControlsSection } from '../../runtime/host/decky'

export function DocSection({ children }: { children: React.ReactNode }) {
  return (
    <DialogBody>
      <DialogControlsSection>
        {children}
        <div style={{ height: 40 }} />
      </DialogControlsSection>
    </DialogBody>
  )
}
