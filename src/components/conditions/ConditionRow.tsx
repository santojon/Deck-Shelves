import type { CSSProperties } from 'react'
import { DialogButton, Focusable } from '../../runtime/host/decky'
import { flowChildrenProps } from '../../core/steamOSVersion'
import type { SettingsController } from '../../features/settings/controller'
import type { PlatformCollection } from '../../runtime/platform'
import type { FilterItem, FilterItemType } from '../../types'
import i18n from '../../i18n'
import { CheckIcon, XIcon } from '../icons'
import { icons } from '../qam/icons'
import { CollapsibleSection } from '../ui'
import { BTN_ICON_STYLE } from '../ui/buttonStyles'
import ConditionFields from './ConditionFields'
import { ConditionTypePicker } from './ConditionTypePicker'
import { canNegate, isComplete, negatable, startingParams, typeName } from './pluginTypes'

const INNER_LIST: Partial<Record<string, 'items' | 'children'>> = {
  merge: 'items',
  weightedFilter: 'children',
  priorityFilter: 'children',
  exclusionGroup: 'children',
}
const GROUPING_TYPES = Object.keys(INNER_LIST) as FilterItemType[]

const SHOWN_VALUE: Partial<Record<string, (p: Record<string, any>) => unknown>> = {
  nameIncludes: (p) => p.text,
  nameRegex: (p) => p.pattern,
  franchise: (p) => p.franchise,
  developer: (p) => p.developers,
  publisher: (p) => p.publishers,
  genres: (p) => p.genres,
  categories: (p) => p.categories,
  customTags: (p) => p.tags,
  parserCategories: (p) => p.tags,
  storeTag: (p) => p.tags,
  appIdList: (p) => p.appIds,
}

const HINT_STYLE: CSSProperties = { padding: '2px var(--ds-pad-row, 16px) 6px', fontSize: 12, lineHeight: 1.4, color: 'var(--ds-text-dim, #8b9ab5)' }
const ACTIONS_STYLE: CSSProperties = { display: 'flex', gap: 8, padding: '6px var(--ds-pad-row, 16px) 4px' }
const NEGATED_STYLE: CSSProperties = { ...BTN_ICON_STYLE, color: 'var(--ds-accent, #4a9eff)' }

function innerConditions(item: FilterItem): FilterItem[] {
  const key = INNER_LIST[item.type]
  const list = key ? item.params?.[key] : undefined
  return Array.isArray(list) ? list : []
}

function withType(item: FilterItem, type: string): FilterItem {
  const params = startingParams(type)
  const key = INNER_LIST[type]
  const inner = innerConditions(item)
  if (key && inner.length > 0) params[key] = inner
  return negatable(type) ? { ...item, type, params } : { ...item, type, params, inverted: false }
}

function shownValue(item: FilterItem, collections: readonly PlatformCollection[]): string {
  const p = item.params ?? {}
  const value = item.type === 'collection'
    ? collections.find((c) => c.id === String(p.collectionId))?.name
    : SHOWN_VALUE[item.type]?.(p)
  return Array.isArray(value) ? value.join(', ') : String(value ?? '')
}

export function describeCondition(item: FilterItem, collections: readonly PlatformCollection[] = []): string {
  const name = typeName(item.type)
  const title = item.inverted ? i18n.t('filter_condition_negated', { type: name }) : name
  const value = shownValue(item, collections)
  return value ? `${title} · ${value}` : title
}

function CompletenessMark({ complete }: { complete: boolean }) {
  const label = i18n.t(complete ? 'filter_condition_complete' : 'filter_condition_incomplete')
  return (
    <span role='img' aria-label={label} title={label} style={{ display: 'inline-flex', flexShrink: 0 }}>
      {complete ? <CheckIcon /> : <XIcon />}
    </span>
  )
}

interface ConditionRowProps {
  item: FilterItem
  startOpen: boolean
  nodeRef: (node: HTMLDivElement | null) => void
  onChange: (next: FilterItem) => void
  onRemove: () => void
  controller?: SettingsController
  allowOnlineFilters: boolean
  onlineFeaturesOn: boolean
}

export function ConditionRow({ item, startOpen, nodeRef, onChange, onRemove, controller, allowOnlineFilters, onlineFeaturesOn }: ConditionRowProps) {
  const t = i18n.t.bind(i18n)
  // Changing the type would drop the conditions inside, so only the grouping types stay on offer.
  const holdsConditions = innerConditions(item).length > 0
  const negateLabel = t(item.inverted ? 'filter_condition_unnegate' : 'filter_condition_negate')
  const removeLabel = t('remove')
  return (
    <div ref={nodeRef}>
      <CollapsibleSection
        title={describeCondition(item, controller?.collections)}
        count={0}
        initialOpen={startOpen}
        status={<CompletenessMark complete={isComplete(item)} />}
      >
        <ConditionTypePicker
          type={item.type}
          onChange={(type) => onChange(withType(item, type))}
          allowOnlineFilters={allowOnlineFilters}
          onlineFeaturesOn={onlineFeaturesOn}
          only={holdsConditions ? GROUPING_TYPES : undefined}
        />
        {holdsConditions ? <div style={HINT_STYLE}>{t('filter_condition_type_locked')}</div> : null}
        <ConditionFields
          item={item}
          onChange={(patch) => onChange({ ...item, ...patch })}
          controller={controller}
          allowOnlineFilters={allowOnlineFilters}
          onlineFeaturesOn={onlineFeaturesOn}
        />
        <Focusable {...flowChildrenProps('horizontal')} style={ACTIONS_STYLE}>
          {canNegate(item) ? (
            <DialogButton
              style={item.inverted ? NEGATED_STYLE : BTN_ICON_STYLE}
              onClick={() => onChange({ ...item, inverted: !item.inverted })}
              onOKActionDescription={negateLabel}
              aria-label={negateLabel}
            >
              {icons.negate}
            </DialogButton>
          ) : null}
          <DialogButton style={BTN_ICON_STYLE} onClick={onRemove} onOKActionDescription={removeLabel} aria-label={removeLabel}>
            {icons.trash}
          </DialogButton>
        </Focusable>
      </CollapsibleSection>
    </div>
  )
}
