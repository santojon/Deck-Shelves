import React, { useState } from 'react'
import { Focusable } from '@decky/ui'

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export function DocAccordion({ label, children, defaultOpen = false }: {
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen(v => !v)

  return (
    <div style={{ marginBottom: 2 }}>
      <Focusable
        style={{ padding: 0, margin: 0, width: '100%' }}
        onClick={toggle}
        onOKButton={toggle}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 0', cursor: 'pointer',
          borderBottom: open ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: open ? '#dcdedf' : '#8b9ab5', letterSpacing: 0.2 }}>
            {label}
          </span>
          <span style={{ color: '#8b9ab5' }}>
            <Chevron open={open} />
          </span>
        </div>
        {open && (
          <div style={{ paddingTop: 4, paddingBottom: 4 }}>
            {children}
          </div>
        )}
      </Focusable>
    </div>
  )
}
