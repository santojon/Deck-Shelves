import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DialogButton, Field, Focusable } from '../../runtime/host/decky'
import { flowChildrenProps } from '../../core/steamOSVersion'
import { takeNavTreeFocus } from '../../runtime/navFocus'
import type { SettingsController } from '../../features/settings/controller'
import type { FilterGroup, FilterItem, FilterItemType } from '../../types'
import i18n from '../../i18n'
import { CheckIcon } from '../icons'
import { icons } from '../qam/icons'
import { BTN_ICON_STYLE } from '../ui/buttonStyles'
import { ConditionRow } from './ConditionRow'
import { startingOptions } from './utils'

export interface ConditionEditorProps {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  controller?: SettingsController
  // The source is the wishlist or the store, where price and discount apply.
  allowOnlineFilters?: boolean
  // Online features are on, so the types that need store data are offered.
  onlineFeaturesOn?: boolean
  // Hides the all/any choice when the rule comes from elsewhere, as in a composite type.
  hideMode?: boolean
}

type Mode = FilterGroup['mode']

const NEW_CONDITION_TYPE: FilterItemType = 'installed'
const ADD_CONTROL = 'add'

const CHOICE_STYLE: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }

// Stored conditions carry no id, so the keys live only here, one per object.
function createConditionKeys() {
  const byItem = new WeakMap<FilterItem, string>()
  let count = 0
  const of = (item: FilterItem): string => {
    let key = byItem.get(item)
    if (!key) {
      key = `c${++count}`
      byItem.set(item, key)
    }
    return key
  }
  // An edit makes a new object; it keeps the key of the one it replaces.
  const carry = (from: FilterItem, to: FilterItem) => { byItem.set(to, of(from)) }
  return { of, carry }
}

// A parent may hand back a fresh array, such as a new empty list, so compare
// the conditions themselves.
const sameItems = (a: FilterItem[], b: FilterItem[]) => a.length === b.length && a.every((item, i) => item === b[i])

// Steam's focus follows its navigation nodes; ask for it a frame later, once
// the row that was just drawn is in the tree.
function focusLater(target: HTMLElement | null | undefined): void {
  const win = target?.ownerDocument.defaultView
  if (!target || !win) return
  win.requestAnimationFrame(() => {
    if (!takeNavTreeFocus(target)) target.focus()
  })
}

function MatchChoice({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const t = i18n.t.bind(i18n)
  const choice = (value: Mode, label: string) => (
    <DialogButton style={CHOICE_STYLE} onClick={() => { if (value !== mode) onChange(value) }}>
      {value === mode ? <CheckIcon /> : null}
      {label}
    </DialogButton>
  )
  return (
    <Field label={t('filter_group_mode_label')} childrenLayout='below' bottomSeparator='none'>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', gap: 8, width: '100%' }}>
        {choice('and', t('filter_group_mode_and'))}
        {choice('or', t('filter_group_mode_or'))}
      </Focusable>
    </Field>
  )
}

/** Edits a filter group: whether all or any of its conditions must match, and the conditions. */
export function ConditionEditor({ group, onChange, controller, allowOnlineFilters = false, onlineFeaturesOn = false, hideMode = false }: ConditionEditorProps) {
  const [keys] = useState(createConditionKeys)
  const [added, setAdded] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const addControl = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<{ items: FilterItem[]; target: string } | null>(null)
  const { mode, items } = group
  const rowKeys = items.map(keys.of)
  const addLabel = i18n.t('filter_condition_add')

  // Focus moves only once this editor's own change comes back as the group. A
  // saved filter applied from the bar replaces the list and leaves focus there.
  useLayoutEffect(() => {
    const request = pendingFocus.current
    if (!request || !sameItems(request.items, items)) return
    pendingFocus.current = null
    focusLater(request.target === ADD_CONTROL
      ? addControl.current?.querySelector<HTMLElement>('button, [role="button"]')
      : rows.current.get(request.target)?.querySelector<HTMLElement>('.ds-collapsible-header'))
  })

  const send = (next: FilterItem[], focusTarget?: string) => {
    pendingFocus.current = focusTarget ? { items: next, target: focusTarget } : null
    onChange({ mode, items: next })
  }
  const add = () => {
    const item: FilterItem = { type: NEW_CONDITION_TYPE, params: startingOptions(NEW_CONDITION_TYPE) }
    const key = keys.of(item)
    setAdded(key)
    send([...items, item], key)
  }
  const replace = (index: number, next: FilterItem) => {
    keys.carry(items[index], next)
    send(items.map((item, i) => (i === index ? next : item)))
  }
  // The condition above takes the focus, else the one below, else the add button.
  const remove = (index: number) => {
    send(items.filter((_, i) => i !== index), rowKeys[index - 1] ?? rowKeys[index + 1] ?? ADD_CONTROL)
  }
  const track = (key: string) => (node: HTMLDivElement | null) => {
    if (node) rows.current.set(key, node)
    else rows.current.delete(key)
  }

  return (
    <div>
      {hideMode ? null : <MatchChoice mode={mode} onChange={(next) => onChange({ mode: next, items })} />}
      {items.map((item, index) => (
        <ConditionRow
          key={rowKeys[index]}
          item={item}
          startOpen={rowKeys[index] === added}
          nodeRef={track(rowKeys[index])}
          onChange={(next) => replace(index, next)}
          onRemove={() => remove(index)}
          controller={controller}
          allowOnlineFilters={allowOnlineFilters}
          onlineFeaturesOn={onlineFeaturesOn}
        />
      ))}
      <div ref={addControl} style={{ marginTop: 8 }}>
        <DialogButton style={BTN_ICON_STYLE} onClick={add} onOKActionDescription={addLabel} aria-label={addLabel}>
          {icons.add}
        </DialogButton>
      </div>
    </div>
  )
}
