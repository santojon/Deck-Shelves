import { Focusable, DialogButton, Dropdown, ToggleField } from '../../../../runtime/host/decky'
import { flowChildrenProps } from '../../../../core/steamOSVersion'
import { optionData } from './utils'

/* Self-contained editor for a Visibility Rules v2 tree
   ({ mode:'any'|'all', rules:[...] }). Emits a new value via `onChange`
   (undefined when empty, so a cleared tree persists as "no restriction").
   Only the time/day kinds are editable; unknown kinds (device rules added
   later) render read-only so an older editor never drops them. */

type Rule = { kind: string } & Record<string, any>
type Visibility = { mode: 'any' | 'all'; rules: Rule[] }
type T = (k: string, opts?: any) => string

const HOURS = Array.from({ length: 24 }, (_, h) => ({ data: h, label: `${String(h).padStart(2, '0')}:00` }))
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const KNOWN_KINDS = ['timeWindow', 'dayOfWeek', 'battery', 'charging', 'offline', 'externalDisplay', 'resolution', 'ultrawide']
const BATTERY_LEVELS = [10, 15, 20, 25, 30, 40, 50].map((n) => ({ data: n, label: `${n}%` }))
const RESOLUTION_WIDTHS = [1280, 1600, 1920, 2560, 3440, 3840].map((n) => ({ data: n, label: `${n}px` }))

function BatteryRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ opacity: 0.7, fontSize: 12 }}>{t('visibility_battery_below')}</span>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={BATTERY_LEVELS} selectedOption={Number(rule.below) || 20} onChange={(o: unknown) => onUpdate({ below: Number(optionData(o) ?? 20) })} />
      </div>
    </Focusable>
  )
}

function ResolutionRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ opacity: 0.7, fontSize: 12 }}>{t('visibility_resolution_min')}</span>
      <div style={{ width: 120 }}>
        <Dropdown rgOptions={RESOLUTION_WIDTHS} selectedOption={Number(rule.minWidth) || 1920} onChange={(o: unknown) => onUpdate({ minWidth: Number(optionData(o) ?? 1920) })} />
      </div>
    </Focusable>
  )
}

function TimeWindowRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const setHour = (k: 'start' | 'end', opt: unknown) => {
    const n = Number(optionData(opt) ?? 0)
    if (Number.isFinite(n)) onUpdate({ [k]: n })
  }
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={HOURS} selectedOption={Number(rule.start) || 0} onChange={(o: unknown) => setHour('start', o)} />
      </div>
      <span style={{ opacity: 0.6 }}>{t('visibility_to')}</span>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={HOURS} selectedOption={Number(rule.end) || 0} onChange={(o: unknown) => setHour('end', o)} />
      </div>
    </Focusable>
  )
}

function DayOfWeekRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const days: number[] = Array.isArray(rule.days) ? rule.days : []
  const toggle = (day: number) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    onUpdate({ days: next })
  }
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '4px 0', width: '100%', boxSizing: 'border-box' }}>
      {DAYS.map((day) => {
        const active = days.includes(day)
        return (
          <DialogButton key={day} onClick={() => toggle(day)} onOKButton={() => toggle(day)} style={{ width: '100%', minWidth: 0, minHeight: 32, padding: '4px 2px', fontSize: 12 }}>
            <span style={{ color: active ? '#4caf50' : 'rgba(255,255,255,0.35)' }}>{active ? '✓ ' : ''}{t(`smart_visible_day_${day}`)}</span>
          </DialogButton>
        )
      })}
    </Focusable>
  )
}

function RuleRow({ rule, onUpdate, onRemove, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; onRemove: () => void; t: T }) {
  const label = KNOWN_KINDS.includes(rule.kind) ? t(`visibility_rule_${rule.kind}`) : rule.kind
  return (
    <div style={{ padding: '4px 0 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <DialogButton onClick={onRemove} onOKButton={onRemove} onOKActionDescription={t('remove')} style={{ minWidth: 40, width: 40, padding: 8 }}>×</DialogButton>
      </Focusable>
      {rule.kind === 'timeWindow' && <TimeWindowRow rule={rule} onUpdate={onUpdate} t={t} />}
      {rule.kind === 'dayOfWeek' && <DayOfWeekRow rule={rule} onUpdate={onUpdate} t={t} />}
      {rule.kind === 'battery' && <BatteryRow rule={rule} onUpdate={onUpdate} t={t} />}
      {rule.kind === 'resolution' && <ResolutionRow rule={rule} onUpdate={onUpdate} t={t} />}
    </div>
  )
}

export function VisibilityRulesEditor({ value, onChange, t }: {
  value: Visibility | undefined
  onChange: (v: Visibility | undefined) => void
  t: T
}) {
  const vis: Visibility = value && Array.isArray(value.rules) ? value : { mode: 'any', rules: [] }
  const setRules = (rules: Rule[]) => onChange(rules.length ? { mode: vis.mode, rules } : undefined)
  const addRule = (r: Rule) => setRules([...vis.rules, r])

  return (
    <div style={{ paddingTop: 10 }}>
      {vis.rules.length > 1 && (
        <ToggleField
          label={t('visibility_mode_all_label')}
          description={t('visibility_mode_all_desc')}
          checked={vis.mode === 'all'}
          onChange={(v: boolean) => onChange({ mode: v ? 'all' : 'any', rules: vis.rules })}
        />
      )}
      {vis.rules.map((rule, i) => (
        <RuleRow
          key={i}
          rule={rule}
          onUpdate={(p) => setRules(vis.rules.map((r, idx) => (idx === i ? { ...r, ...p } : r)))}
          onRemove={() => setRules(vis.rules.filter((_, idx) => idx !== i))}
          t={t}
        />
      ))}
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', gap: 8, padding: '8px 0 2px' }}>
        <DialogButton style={{ flex: 1 }} onClick={() => addRule({ kind: 'timeWindow', start: 9, end: 17 })} onOKButton={() => addRule({ kind: 'timeWindow', start: 9, end: 17 })}>+ {t('visibility_add_time')}</DialogButton>
        <DialogButton style={{ flex: 1 }} onClick={() => addRule({ kind: 'dayOfWeek', days: [] })} onOKButton={() => addRule({ kind: 'dayOfWeek', days: [] })}>+ {t('visibility_add_days')}</DialogButton>
      </Focusable>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'battery', below: 20 })} onOKButton={() => addRule({ kind: 'battery', below: 20 })}>+ {t('visibility_rule_battery')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'charging' })} onOKButton={() => addRule({ kind: 'charging' })}>+ {t('visibility_rule_charging')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'offline' })} onOKButton={() => addRule({ kind: 'offline' })}>+ {t('visibility_rule_offline')}</DialogButton>
      </Focusable>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'externalDisplay' })} onOKButton={() => addRule({ kind: 'externalDisplay' })}>+ {t('visibility_rule_externalDisplay')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'ultrawide' })} onOKButton={() => addRule({ kind: 'ultrawide' })}>+ {t('visibility_rule_ultrawide')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'resolution', minWidth: 1920 })} onOKButton={() => addRule({ kind: 'resolution', minWidth: 1920 })}>+ {t('visibility_rule_resolution')}</DialogButton>
      </Focusable>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1 }} onClick={() => onChange({ mode: 'any', rules: [{ kind: 'timeWindow', start: 18, end: 23 }] })} onOKButton={() => onChange({ mode: 'any', rules: [{ kind: 'timeWindow', start: 18, end: 23 }] })}>{t('visibility_preset_evenings')}</DialogButton>
        <DialogButton style={{ flex: 1 }} onClick={() => onChange({ mode: 'any', rules: [{ kind: 'dayOfWeek', days: [0, 6] }] })} onOKButton={() => onChange({ mode: 'any', rules: [{ kind: 'dayOfWeek', days: [0, 6] }] })}>{t('visibility_preset_weekends')}</DialogButton>
      </Focusable>
    </div>
  )
}
