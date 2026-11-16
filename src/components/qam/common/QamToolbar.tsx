import type { ReactNode } from 'react'
import { DialogButton, Focusable } from '../../../runtime/host/decky'
import { BTN_ICON_STYLE } from '../../ui/buttonStyles'

export function QamToolbar({ children }: { children: ReactNode }) {
  return <Focusable className='deck-shelves-bare-row' flow-children='row'>{children}</Focusable>
}

const BUTTON_STYLE = { ...BTN_ICON_STYLE, width: '100%' }

export function ToolbarButton({ icon, label, onActivate }: { icon: ReactNode; label: string; onActivate: () => void }) {
  return (
    <div className='deck-shelves-action-btn'>
      <DialogButton style={BUTTON_STYLE} onClick={onActivate} onOKButton={onActivate} onOKActionDescription={label} aria-label={label}>
        {icon}
      </DialogButton>
    </div>
  )
}
