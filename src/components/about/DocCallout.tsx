import React from 'react'
import { useTranslation } from 'react-i18next'

type CalloutVariant = 'note' | 'tip' | 'caution'

const CONFIG: Record<CalloutVariant, { color: string; labelKey: string }> = {
  note:    { color: '#5b9bd5', labelKey: 'docs_callout_note' },
  tip:     { color: '#4caf50', labelKey: 'docs_callout_tip' },
  caution: { color: '#f0a742', labelKey: 'docs_callout_caution' },
}

export function DocCallout({ variant = 'note', children }: { variant?: CalloutVariant; children: React.ReactNode }) {
  const { t } = useTranslation()
  const { color, labelKey } = CONFIG[variant]
  const label = t(labelKey as any)
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: `${color}1a`,
      borderRadius: '0 4px 4px 0',
      padding: '8px 12px',
      margin: '4px 0',
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
    }}>
      <span style={{ color, fontWeight: 700, fontSize: 10, flexShrink: 0, marginTop: 2, letterSpacing: 0.8 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#b8bcbf', lineHeight: '18px', flex: 1 }}>
        {children}
      </span>
    </div>
  )
}
