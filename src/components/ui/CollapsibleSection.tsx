import { useState } from 'react'
import { Focusable } from '../../runtime/host/decky'

const SECTIONS_KEY = 'ds-qam-sections'

function loadSections(): Record<string, boolean> {
  try { const raw = localStorage.getItem(SECTIONS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}

function saveSections(state: Record<string, boolean>) {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(state)) } catch {}
}

const _sectionOpen: Record<string, boolean> = loadSections()

export function CollapsibleSection({
  id,
  title,
  count,
  initialOpen,
  icon,
  headerExtra,
  children,
}: {
  id: string;
  title: string;
  count: number;
  initialOpen?: boolean;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const defaultOpen = id in _sectionOpen ? _sectionOpen[id] : (initialOpen !== undefined ? initialOpen : count > 0)
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => {
    const next = !o
    _sectionOpen[id] = next
    saveSections(_sectionOpen)
    return next
  })
  const chevron = <span style={{ fontSize: 9, color: 'var(--ds-text-dim, #b8bcbf)' }}>{open ? '▲' : '▼'}</span>
  return (
    <div
      className='ds-collapsible-box'
      style={{
        marginTop: 8,
        background: 'var(--ds-surface, rgba(255,255,255,0.04))',
        border: '1px solid var(--ds-border, rgba(255,255,255,0.08))',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* The title bar is ONE focus stop that toggles the section (as before).
            Buttons + chevron sit to its right; when there are buttons the chevron
            moves beside them (left of it). The chevron is a plain clickable span,
            not a separate gamepad focus stop, so the title stays the focus. */}
        <Focusable className='ds-collapsible-header' data-ds-section={id} onClick={toggle} onOKButton={toggle} style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {icon}
            {title}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!open && count > 0 ? <span className='ds-collapsible-badge'>{count}</span> : null}
            {!headerExtra ? chevron : null}
          </span>
        </Focusable>
        {headerExtra ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 8px' }} onClick={(e) => e.stopPropagation()}>
            {headerExtra}
            <span onClick={toggle} style={{ cursor: 'pointer', display: 'flex' }}>{chevron}</span>
          </div>
        ) : null}
      </div>
      {open ? <div className='deck-shelves-separator' /> : null}
      {open ? <div style={{ padding: '2px 14px 10px' }}>{children}</div> : null}
    </div>
  )
}
