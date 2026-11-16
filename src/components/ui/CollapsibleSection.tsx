import { useState } from 'react'
import { Focusable } from '../../runtime/host/decky'
import { flowChildrenProps } from '../../core/steamOSVersion'

const SECTIONS_KEY = 'ds-qam-sections'

function loadSections(): Record<string, boolean> {
  try { const raw = localStorage.getItem(SECTIONS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}

function saveSections(state: Record<string, boolean>) {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(state)) } catch {}
}

const _sectionOpen: Record<string, boolean> = loadSections()

function initiallyOpen(id: string | undefined, initialOpen: boolean | undefined, count: number): boolean {
  if (id !== undefined && id in _sectionOpen) return _sectionOpen[id]
  return initialOpen ?? count > 0
}

export function CollapsibleSection({
  id,
  title,
  count,
  initialOpen,
  icon,
  headerExtra,
  status,
  children,
}: {
  id?: string;
  title: string;
  count: number;
  initialOpen?: boolean;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => initiallyOpen(id, initialOpen, count))
  const toggle = () => setOpen((o) => {
    const next = !o
    if (id !== undefined) {
      _sectionOpen[id] = next
      saveSections(_sectionOpen)
    }
    return next
  })
  const chevron = <span style={{ fontSize: 9, color: 'var(--ds-text-dim, #b8bcbf)' }}>{open ? '▲' : '▼'}</span>
  return (
    <div className='ds-collapsible-box'>
      <Focusable className='ds-collapsible-row' {...flowChildrenProps('vertical')} noFocusRing focusWithinClassName='gpfocuswithin' style={{ display: 'flex', alignItems: 'center' }}>
        <Focusable className='ds-collapsible-header' data-ds-section={id} onClick={toggle} onOKButton={toggle} noFocusRing style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {icon}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!open && count > 0 ? <span className='ds-collapsible-badge'>{count}</span> : null}
            {status}
            {!headerExtra ? chevron : null}
          </span>
        </Focusable>
        {headerExtra ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
            {headerExtra}
            <span onClick={toggle} style={{ cursor: 'pointer', display: 'flex' }}>{chevron}</span>
          </div>
        ) : null}
      </Focusable>
      {open ? <div className='deck-shelves-divider' /> : null}
      {open ? <div className='ds-collapsible-content'>{children}</div> : null}
    </div>
  )
}
