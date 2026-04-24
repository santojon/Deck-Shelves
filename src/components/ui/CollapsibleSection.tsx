import { useState } from 'react'
import { Focusable } from '@decky/ui'

/**
 * Collapsible section used by the QAM panel (Behavior / Shelves / Smart /
 * Visual Global / Saved Filters). Header click toggles, localStorage
 * persists open state per `id`, and a badge shows the live count when the
 * section is closed.
 *
 * The toggle state is stored at module scope so re-mounting the QAM panel
 * doesn't reset the user's expand/collapse choices. Separator + badge
 * styling lives in [DeckQAMStyles](../styles/DeckQAMStyles.tsx).
 */
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
  children,
}: {
  id: string;
  title: string;
  count: number;
  initialOpen?: boolean;
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
  return (
    <>
      <div style={{ marginTop: 8 }}>
        <Focusable className='ds-collapsible-header' onClick={toggle} onOKButton={toggle}>
          <span>{title}</span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {!open && count > 0 && <span className='ds-collapsible-badge'>{count}</span>}
            <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
          </span>
        </Focusable>
      </div>
      <div className='deck-shelves-separator' />
      {open && children}
    </>
  )
}
