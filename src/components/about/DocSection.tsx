import React from 'react'
import { DialogBody, DialogControlsSection } from '@decky/ui'

export function DocSection({ children }: { children: React.ReactNode }) {
  return (
    <DialogBody>
      <DialogControlsSection>{children}</DialogControlsSection>
    </DialogBody>
  )
}
