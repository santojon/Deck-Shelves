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
const KNOWN_KINDS = ['timeWindow', 'dayOfWeek', 'weekend', 'timeOfDayPeriod', 'season', 'holiday', 'lastGameSource', 'gameRunning', 'battery', 'charging', 'offline', 'externalDisplay', 'resolution', 'ultrawide', 'highCpu', 'lowMemory', 'lowFrameBudget']
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

const CPU_LEVELS = [50, 60, 70, 80, 90].map((n) => ({ data: n, label: `${n}%` }))
const MEM_LEVELS = [5, 10, 15, 20, 25, 30].map((n) => ({ data: n, label: `${n}%` }))
const FPS_LEVELS = [30, 40, 45, 50, 60].map((n) => ({ data: n, label: `${n} fps` }))

function FrameBudgetRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <span style={{ opacity: 0.7, fontSize: 12 }}>{t('visibility_fps_below')}</span>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={FPS_LEVELS} selectedOption={Number(rule.belowFps) || 45} onChange={(o: unknown) => onUpdate({ belowFps: Number(optionData(o) ?? 45) })} />
      </div>
    </Focusable>
  )
}

function HighCpuRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <span style={{ opacity: 0.7, fontSize: 12 }}>{t('visibility_cpu_above')}</span>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={CPU_LEVELS} selectedOption={Number(rule.above) || 80} onChange={(o: unknown) => onUpdate({ above: Number(optionData(o) ?? 80) })} />
      </div>
    </Focusable>
  )
}

function LowMemoryRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <span style={{ opacity: 0.7, fontSize: 12 }}>{t('visibility_mem_below')}</span>
      <div style={{ width: 100 }}>
        <Dropdown rgOptions={MEM_LEVELS} selectedOption={Number(rule.below) || 15} onChange={(o: unknown) => onUpdate({ below: Number(optionData(o) ?? 15) })} />
      </div>
    </Focusable>
  )
}

const PERIOD_KEYS = ['morning', 'afternoon', 'evening', 'night']
const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter']
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ data: i + 1, label: String(i + 1).padStart(2, '0') }))
const DOM = Array.from({ length: 31 }, (_, i) => ({ data: i + 1, label: String(i + 1).padStart(2, '0') }))
const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' } as const

function EnumDropdown({ value, fallback, options, onPick }: { value: unknown; fallback: string; options: { data: string; label: string }[]; onPick: (v: string) => void }) {
  return (
    <div style={{ width: 150 }}>
      <Dropdown rgOptions={options} selectedOption={String(value ?? fallback)} onChange={(o: unknown) => onPick(String(optionData(o) ?? fallback))} />
    </div>
  )
}

function WeekendRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const opts = [{ data: 'weekend', label: t('visibility_weekend_weekend') }, { data: 'weekday', label: t('visibility_weekend_weekday') }]
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <EnumDropdown value={rule.value} fallback="weekend" options={opts} onPick={(v) => onUpdate({ value: v })} />
    </Focusable>
  )
}

function PeriodRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const opts = PERIOD_KEYS.map((k) => ({ data: k, label: t(`visibility_period_${k}`) }))
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <EnumDropdown value={rule.period} fallback="morning" options={opts} onPick={(v) => onUpdate({ period: v })} />
    </Focusable>
  )
}

function SeasonRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const seasons = SEASON_KEYS.map((k) => ({ data: k, label: t(`visibility_season_${k}`) }))
  const hemis = [{ data: 'north', label: t('visibility_hemisphere_north') }, { data: 'south', label: t('visibility_hemisphere_south') }]
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={{ ...rowStyle, flexWrap: 'wrap' }}>
      <EnumDropdown value={rule.season} fallback="summer" options={seasons} onPick={(v) => onUpdate({ season: v })} />
      <EnumDropdown value={rule.hemisphere} fallback="north" options={hemis} onPick={(v) => onUpdate({ hemisphere: v })} />
    </Focusable>
  )
}

function HolidayRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const ranges: any[] = Array.isArray(rule.ranges) ? rule.ranges : []
  const part = (s: unknown, i: number) => Number(String(s || '01-01').split('-')[i]) || 1
  const set = (idx: number, key: 'start' | 'end', m: number, d: number) => {
    const v = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    onUpdate({ ranges: ranges.map((r, i) => (i === idx ? { ...r, [key]: v } : r)) })
  }
  const addRange = () => onUpdate({ ranges: [...ranges, { start: '12-20', end: '12-31' }] })
  const removeRange = (idx: number) => onUpdate({ ranges: ranges.filter((_, i) => i !== idx) })
  return (
    <div style={{ padding: '4px 0' }}>
      {ranges.map((r, i) => (
        <Focusable key={i} {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', flexWrap: 'wrap' }}>
          <div style={{ width: 64 }}><Dropdown rgOptions={MONTHS} selectedOption={part(r.start, 0)} onChange={(o: unknown) => set(i, 'start', Number(optionData(o)) || 1, part(r.start, 1))} /></div>
          <div style={{ width: 64 }}><Dropdown rgOptions={DOM} selectedOption={part(r.start, 1)} onChange={(o: unknown) => set(i, 'start', part(r.start, 0), Number(optionData(o)) || 1)} /></div>
          <span style={{ opacity: 0.6 }}>{t('visibility_to')}</span>
          <div style={{ width: 64 }}><Dropdown rgOptions={MONTHS} selectedOption={part(r.end, 0)} onChange={(o: unknown) => set(i, 'end', Number(optionData(o)) || 1, part(r.end, 1))} /></div>
          <div style={{ width: 64 }}><Dropdown rgOptions={DOM} selectedOption={part(r.end, 1)} onChange={(o: unknown) => set(i, 'end', part(r.end, 0), Number(optionData(o)) || 1)} /></div>
          <DialogButton onClick={() => removeRange(i)} onOKButton={() => removeRange(i)} onOKActionDescription={t('remove')} style={{ minWidth: 32, width: 32, padding: 6 }}>×</DialogButton>
        </Focusable>
      ))}
      <DialogButton onClick={addRange} onOKButton={addRange} style={{ marginTop: 4 }}>+ {t('visibility_holiday_add_range')}</DialogButton>
    </div>
  )
}

function LastGameSourceRow({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const opts = [{ data: 'steam', label: t('visibility_source_steam') }, { data: 'nonSteam', label: t('visibility_source_nonsteam') }]
  return (
    <Focusable {...flowChildrenProps('horizontal')} style={rowStyle}>
      <EnumDropdown value={rule.value} fallback="steam" options={opts} onPick={(v) => onUpdate({ value: v })} />
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

// Kind → the extra param editor row (kinds with no params render nothing).
const RULE_BODIES: Record<string, (p: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) => any> = {
  timeWindow: TimeWindowRow,
  dayOfWeek: DayOfWeekRow,
  weekend: WeekendRow,
  timeOfDayPeriod: PeriodRow,
  season: SeasonRow,
  holiday: HolidayRow,
  lastGameSource: LastGameSourceRow,
  battery: BatteryRow,
  resolution: ResolutionRow,
  highCpu: HighCpuRow,
  lowMemory: LowMemoryRow,
  lowFrameBudget: FrameBudgetRow,
}

function RuleBody({ rule, onUpdate, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; t: T }) {
  const Body = RULE_BODIES[rule.kind]
  return Body ? <Body rule={rule} onUpdate={onUpdate} t={t} /> : null
}

function RuleRow({ rule, onUpdate, onRemove, t }: { rule: Rule; onUpdate: (p: Partial<Rule>) => void; onRemove: () => void; t: T }) {
  const label = KNOWN_KINDS.includes(rule.kind) ? t(`visibility_rule_${rule.kind}`) : rule.kind
  return (
    <div style={{ padding: '4px 0 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <DialogButton onClick={onRemove} onOKButton={onRemove} onOKActionDescription={t('remove')} style={{ minWidth: 40, width: 40, padding: 8 }}>×</DialogButton>
      </Focusable>
      <RuleBody rule={rule} onUpdate={onUpdate} t={t} />
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
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'weekend', value: 'weekend' })} onOKButton={() => addRule({ kind: 'weekend', value: 'weekend' })}>+ {t('visibility_rule_weekend')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'timeOfDayPeriod', period: 'evening' })} onOKButton={() => addRule({ kind: 'timeOfDayPeriod', period: 'evening' })}>+ {t('visibility_rule_timeOfDayPeriod')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'season', season: 'summer' })} onOKButton={() => addRule({ kind: 'season', season: 'summer' })}>+ {t('visibility_rule_season')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'holiday', ranges: [{ start: '12-20', end: '12-31' }] })} onOKButton={() => addRule({ kind: 'holiday', ranges: [{ start: '12-20', end: '12-31' }] })}>+ {t('visibility_rule_holiday')}</DialogButton>
      </Focusable>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'lastGameSource', value: 'nonSteam' })} onOKButton={() => addRule({ kind: 'lastGameSource', value: 'nonSteam' })}>+ {t('visibility_rule_lastGameSource')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'gameRunning' })} onOKButton={() => addRule({ kind: 'gameRunning' })}>+ {t('visibility_rule_gameRunning')}</DialogButton>
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
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'highCpu', above: 80 })} onOKButton={() => addRule({ kind: 'highCpu', above: 80 })}>+ {t('visibility_rule_highCpu')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'lowMemory', below: 15 })} onOKButton={() => addRule({ kind: 'lowMemory', below: 15 })}>+ {t('visibility_rule_lowMemory')}</DialogButton>
        <DialogButton style={{ flex: 1, minWidth: 90 }} onClick={() => addRule({ kind: 'lowFrameBudget', belowFps: 45 })} onOKButton={() => addRule({ kind: 'lowFrameBudget', belowFps: 45 })}>+ {t('visibility_rule_lowFrameBudget')}</DialogButton>
      </Focusable>
      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
        <DialogButton style={{ flex: 1 }} onClick={() => onChange({ mode: 'any', rules: [{ kind: 'timeWindow', start: 18, end: 23 }] })} onOKButton={() => onChange({ mode: 'any', rules: [{ kind: 'timeWindow', start: 18, end: 23 }] })}>{t('visibility_preset_evenings')}</DialogButton>
        <DialogButton style={{ flex: 1 }} onClick={() => onChange({ mode: 'any', rules: [{ kind: 'dayOfWeek', days: [0, 6] }] })} onOKButton={() => onChange({ mode: 'any', rules: [{ kind: 'dayOfWeek', days: [0, 6] }] })}>{t('visibility_preset_weekends')}</DialogButton>
      </Focusable>
    </div>
  )
}
