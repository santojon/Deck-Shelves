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
  const header = (
    <Focusable className='ds-collapsible-header' data-ds-section={id} onClick={toggle} onOKButton={toggle} style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {!open && count > 0 && <span className='ds-collapsible-badge'>{count}</span>}
        <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
      </span>
    </Focusable>
  )
  return (
    <>
      {headerExtra ? (
        <Focusable className='ds-collapsible-row' flow-children='row' noFocusRing style={{ marginTop: 8, display: 'flex', alignItems: 'stretch' }}>
          {header}
          {headerExtra}
        </Focusable>
      ) : (
        <div style={{ marginTop: 8 }}>{header}</div>
      )}
      <div className='deck-shelves-separator' />
      {open && children}
    </>
  )
}
