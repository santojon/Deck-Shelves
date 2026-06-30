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
  // The box (border/rounded background) + content padding only apply in the
  // settings page; the QAM keeps the flat look. Both are CSS-scoped (see
  // DeckQAMStyles) so the class here is the only difference.
  return (
    <div className='ds-collapsible-box'>
      {/* The whole row highlights as one focus unit (CSS `.gpfocuswithin`),
          whether the title toggle or the inline action button is focused. A on
          the title toggles; vertical flow makes dpad-down move title → button →
          next section. */}
      <Focusable className='ds-collapsible-row' flow-children='vertical' noFocusRing focusWithinClassName='gpfocuswithin' style={{ display: 'flex', alignItems: 'center' }}>
        <Focusable className='ds-collapsible-header' data-ds-section={id} onClick={toggle} onOKButton={toggle} noFocusRing style={{ flex: 1, minWidth: 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
            {headerExtra}
            <span onClick={toggle} style={{ cursor: 'pointer', display: 'flex' }}>{chevron}</span>
          </div>
        ) : null}
      </Focusable>
      {open ? <div className='deck-shelves-separator' /> : null}
      {open ? <div className='ds-collapsible-content'>{children}</div> : null}
    </div>
  )
}
