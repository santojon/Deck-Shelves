import React from 'react'
import { Focusable } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'

type CalloutVariant = 'note' | 'tip' | 'caution'

const CONFIG: Record<CalloutVariant, { color: string; bg: string; labelKey: string }> = {
  note:    { color: 'var(--ds-callout-note, #5b9bd5)',     bg: 'var(--ds-callout-note-soft, rgba(91,155,213,0.10))',    labelKey: 'docs_callout_note' },
  tip:     { color: 'var(--ds-callout-tip, #4caf50)',      bg: 'var(--ds-callout-tip-soft, rgba(76,175,80,0.10))',      labelKey: 'docs_callout_tip' },
  caution: { color: 'var(--ds-callout-caution, #f0a742)',  bg: 'var(--ds-callout-caution-soft, rgba(240,167,66,0.10))', labelKey: 'docs_callout_caution' },
}

export function DocCallout({ variant = 'note', children }: { variant?: CalloutVariant; children: React.ReactNode }) {
  const { t } = useTranslation()
  const { color, bg, labelKey } = CONFIG[variant]
  const label = t(labelKey as any)
  return (
    <Focusable style={{ margin: '3px 0', outline: 'none', borderRadius: 'var(--ds-radius-sm, 4px)' }}>
      <div style={{
        borderLeft: `3px solid ${color}`,
        background: bg,
        borderRadius: '0 var(--ds-radius-sm, 4px) var(--ds-radius-sm, 4px) 0',
        padding: '8px 12px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}>
        <span style={{ color, fontWeight: 700, fontSize: 10, flexShrink: 0, marginTop: 2, letterSpacing: 0.8 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ds-text-dim, #b8bcbf)', lineHeight: '18px', flex: 1 }}>
          {children}
        </span>
      </div>
    </Focusable>
  )
}
