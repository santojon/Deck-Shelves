import { useRef, type ReactNode } from 'react'
import { Focusable, GamepadButton } from '../../../../runtime/host/decky'
import { takeNavTreeFocus } from '../../../../runtime/navFocus'

export type EditorTab = { id: string; title: ReactNode; content: ReactNode }

function stepOf(button: unknown): number {
  if (button === GamepadButton.BUMPER_LEFT) return -1
  if (button === GamepadButton.BUMPER_RIGHT) return 1
  return 0
}

// Tabs in the page flow, with no scroll box of their own: the dialog scrolls. L1 and R1 switch tabs.
export function EditorTabs({ tabs, activeTab, onShowTab }: {
  tabs: EditorTab[]
  activeTab: string
  onShowTab: (id: string) => void
}) {
  const tabRefs = useRef<Record<string, HTMLElement | null>>({})
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  const onButtonDown = (evt: any) => {
    const step = stepOf(evt?.detail?.button)
    const next = step === 0 ? undefined : tabs[tabs.indexOf(current) + step]
    if (!next) return
    onShowTab(next.id)
    // The focused row may belong to the panel that is about to go away.
    const entry = tabRefs.current[next.id]
    if (entry && !takeNavTreeFocus(entry)) entry.focus()
  }
  return (
    <Focusable onButtonDown={onButtonDown}>
      <Focusable className='ds-editor-tabs' role='tablist'>
        {tabs.map((tab) => {
          const select = () => onShowTab(tab.id)
          const active = tab === current
          return (
            <Focusable
              key={tab.id}
              ref={(el: HTMLElement | null) => { tabRefs.current[tab.id] = el }}
              className='ds-editor-tab'
              role='tab'
              aria-selected={active}
              data-active={active ? '1' : '0'}
              data-tab={tab.id}
              onClick={select}
              onOKButton={select}
              noFocusRing
            >
              {tab.title}
            </Focusable>
          )
        })}
      </Focusable>
      <div role='tabpanel'>{current?.content}</div>
    </Focusable>
  )
}
