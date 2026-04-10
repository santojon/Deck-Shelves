import React from 'react'
import { Focusable, DialogButton } from '@decky/ui'

export function ActionButton({ iconNode, onClick, okDescription }: { iconNode: React.ReactNode; onClick: () => void; okDescription: string }) {
  return (
    <Focusable className='deck-shelves-action-btn'>
      <DialogButton
        style={{
          height: '40px',
          width: '42px',
          minWidth: 0,
          padding: '10px 12px',
          marginLeft: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onClick={onClick}
        onOKButton={onClick}
        onOKActionDescription={okDescription}
      >
        {iconNode}
      </DialogButton>
    </Focusable>
  )
}
