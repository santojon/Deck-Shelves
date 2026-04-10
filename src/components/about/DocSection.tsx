import React from 'react'

export function DocSection({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      {children}
    </div>
  )
}
