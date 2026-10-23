import React, { useEffect, useMemo, useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '../../runtime/host/decky'
import { ModalShell } from '../../components/ui'
import { useSettingsController, type SettingsController } from '../settings/controller'
import { SETUP_PACKS, previewSetupPack, recommendedPackIds, type SetupPack, type SetupPackGroup, type SetupPreview } from '../../domain/setupPacks'
import { resolveStatSuggestions } from '../../core/statSuggestions'
import { SHELF_TPL_ICON, SMART_TPL_ICON } from '../../components/qam/modals/templateIcons'
import {
  StackIcon, PuzzleIcon, BookmarkIcon, BatteryIcon, RestoreIcon, MonitorIcon, HeadsetIcon, ConsoleIcon, CloudIcon,
  WandIcon, GamepadIcon, SparkleIcon, GearIcon, CheckIcon,
} from '../../components/icons'
import { flowChildrenProps } from '../../core/steamOSVersion'

type Glyph = React.ComponentType<{ size?: number }>
type Step = 'choose' | 'review' | 'done'

const GROUPS: SetupPackGroup[] = ['quick', 'pack', 'device']
const GROUP_KEY: Record<SetupPackGroup, string> = { quick: 'setup_group_quick', pack: 'setup_group_pack', device: 'setup_group_device' }
const GROUP_ICON: Record<SetupPackGroup, Glyph> = { quick: WandIcon, pack: StackIcon, device: GamepadIcon }
const PACK_ICON: Record<string, Glyph> = {
  essential: StackIcon, steam_and_nonsteam: PuzzleIcon, backlog_rescue: BookmarkIcon, portable_deck: BatteryIcon,
  rediscover: RestoreIcon, living_room: MonitorIcon, frame: HeadsetIcon, machine: ConsoleIcon, stream: CloudIcon,
}
// Settings a pack may turn on → their existing labels.
const SETTING_LABEL: Record<string, string> = {
  shelfHeroBackground: 'shelf_hero_background',
  globalHighlightFirst: 'highlight_first',
  smartShelvesEnabled: 'smart_shelves_enabled',
  globalHeroEnabled: 'global_hero_enabled',
  globalFullPageShelf: 'full_page_shelves_label',
  globalEnableLogo: 'enable_logo',
}

const STYLE = `
.ds-setup-steps{display:flex;gap:6px;justify-content:center;margin:0 0 10px}
.ds-setup-step{font-size:10px;letter-spacing:.4px;text-transform:uppercase;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.5)}
.ds-setup-step[data-active="true"]{background:var(--ds-accent,#1a9fff);color:#fff}
.ds-setup-step[data-done="true"]{color:rgba(255,255,255,.85)}
.ds-setup-group{display:flex;align-items:center;gap:6px;font-size:11px;opacity:.7;padding:8px 2px 4px;text-transform:uppercase;letter-spacing:.4px}
.ds-setup-grid{display:flex;flex-wrap:wrap;gap:8px}
.ds-setup-tile{position:relative;flex:1 1 calc(33.333% - 6px);max-width:calc(33.333% - 6px);min-width:110px;min-height:118px;box-sizing:border-box;padding:12px 8px 10px;border-radius:10px;background:var(--ds-surface,rgba(255,255,255,.05));border:1px solid var(--ds-border,rgba(255,255,255,.12));display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
.ds-setup-tile:hover,.ds-setup-tile.gpfocuswithin,.ds-setup-tile:focus{border-color:var(--ds-accent,#1a9fff);background:var(--ds-surface-hi,rgba(255,255,255,.10));transform:translateY(-1px)}
.ds-setup-tile-title{font-size:12px;font-weight:700;line-height:1.2}
.ds-setup-tile-desc{font-size:10px;opacity:.65;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.ds-setup-chip{position:absolute;top:6px;right:6px;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--ds-accent,#1a9fff);color:#fff}
.ds-setup-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.04);font-size:12px}
.ds-setup-row[data-have="true"]{opacity:.5}
.ds-setup-counts{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:4px 0 8px}
.ds-setup-count{font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08)}
.ds-setup-hero{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:4px 0 8px}
`

function Steps({ t, step }: { t: (k: any) => string; step: Step }) {
  const order: Step[] = ['choose', 'review', 'done']
  const idx = order.indexOf(step)
  return (
    <div className='ds-setup-steps'>
      {order.map((s, i) => (
        <span key={s} className='ds-setup-step' data-active={s === step} data-done={i < idx}>{i + 1} · {t(`setup_step_${s}`)}</span>
      ))}
    </div>
  )
}

function PackTile({ t, pack, recommended, onPick }: { t: (k: any) => string; pack: SetupPack; recommended: boolean; onPick: () => void }) {
  const Icon = PACK_ICON[pack.id] ?? StackIcon
  const title = t(`setup_pack_${pack.id}_title`)
  return (
    <Focusable className='ds-setup-tile' focusWithinClassName='gpfocuswithin' onActivate={onPick} onOKButton={onPick} onOKActionDescription={title}>
      {recommended && <span className='ds-setup-chip'>{t('setup_recommended_short')}</span>}
      <Icon size={26} />
      <div className='ds-setup-tile-title'>{title}</div>
      <div className='ds-setup-tile-desc'>{t(`setup_pack_${pack.id}_desc`)}</div>
    </Focusable>
  )
}

function tplIcon(el: React.ReactElement | undefined, Fallback: Glyph): React.ReactNode {
  if (el) return React.cloneElement(el as React.ReactElement<React.SVGProps<SVGSVGElement>>, { width: 16, height: 16 })
  return <Fallback size={16} />
}

function ReviewRows({ t, preview }: { t: (k: any, o?: any) => string; preview: SetupPreview }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {preview.shelves.map((s) => (
        <div key={s.templateId} className='ds-setup-row' data-have={s.already}>
          {tplIcon(SHELF_TPL_ICON[s.templateId], StackIcon)}
          <span style={{ flex: 1 }}>{t(s.titleKey)}</span>
          {s.already && <><CheckIcon size={12} /><span style={{ fontSize: 10 }}>{t('setup_preview_have')}</span></>}
        </div>
      ))}
      {preview.smart.map((s) => (
        <div key={s.mode} className='ds-setup-row' data-have={s.already}>
          {tplIcon(SMART_TPL_ICON[s.mode], SparkleIcon)}
          <span style={{ flex: 1 }}>{t(`smart_template_${s.mode}`)}</span>
          {s.already && <><CheckIcon size={12} /><span style={{ fontSize: 10 }}>{t('setup_preview_have')}</span></>}
        </div>
      ))}
      {preview.settings.map((c) => (
        <div key={c.key} className='ds-setup-row'>
          <GearIcon size={16} />
          <span style={{ flex: 1 }}>{t('setup_preview_setting', { name: t(SETTING_LABEL[c.key] ?? c.key) })}</span>
        </div>
      ))}
    </div>
  )
}

function counts(preview: SetupPreview): { shelves: number; smart: number; settings: number } {
  return {
    shelves: preview.shelves.filter((s) => !s.already).length,
    smart: preview.smart.filter((s) => !s.already).length,
    settings: preview.settings.length,
  }
}

/* Setup wizard: pick a pack from a tile grid (quick presets, situation packs,
   device packs), review exactly what it adds, apply, and land on a done screen
   that offers the one-step undo. Non-destructive (existing shelves kept,
   covered templates skipped); re-openable from the QAM title bar at any time.
   Without a controller (the title-bar entry) it creates its own. */
export function SetupWizardModal({ closeModal, controller }: { closeModal?: () => void; controller?: SettingsController }) {
  if (controller) return <SetupWizardBody closeModal={closeModal} controller={controller} />
  return <StandaloneWizard closeModal={closeModal} />
}

function StandaloneWizard({ closeModal }: { closeModal?: () => void }) {
  const controller = useSettingsController()
  return <SetupWizardBody closeModal={closeModal} controller={controller} />
}

type T = (k: any, o?: any) => string
const btnRow: React.CSSProperties = { width: '100%', minHeight: 36, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }

function ReviewScreen({ t, pack, preview, onApply, onBack }: { t: T; pack: SetupPack; preview: SetupPreview; onApply: () => void; onBack: () => void }) {
  const n = counts(preview)
  const nothing = n.shelves + n.smart + n.settings === 0
  const Icon = PACK_ICON[pack.id] ?? StackIcon
  return (
    <ModalShell>
      <ConfirmModal strTitle={t('setup_wizard_title')} strOKButtonText={t('setup_apply')} strCancelButtonText={t('setup_back')} bOKDisabled={nothing} onOK={onApply} onCancel={onBack} onEscKeypress={onBack}>
        <style>{STYLE}</style>
        <Steps t={t} step='review' />
        <Focusable onMenuButton={nothing ? undefined : onApply} onMenuActionDescription={nothing ? undefined : t('setup_apply')} style={{ padding: '0 4px' }}>
          <div className='ds-setup-hero'>
            <Icon size={30} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t(`setup_pack_${pack.id}_title`)}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{t(`setup_pack_${pack.id}_desc`)}</div>
          </div>
          <div className='ds-setup-counts'>
            <span className='ds-setup-count'>{t('setup_count_shelves', { count: n.shelves })}</span>
            <span className='ds-setup-count'>{t('setup_count_smart', { count: n.smart })}</span>
            <span className='ds-setup-count'>{t('setup_count_settings', { count: n.settings })}</span>
          </div>
          {nothing && <div style={{ fontSize: 12, textAlign: 'center', opacity: 0.8, padding: '4px 0 8px' }}>{t('setup_nothing_to_add')}</div>}
          <div style={{ fontSize: 11, opacity: 0.6, padding: '0 2px 4px' }}>{t('setup_preview_title')}</div>
          <ReviewRows t={t} preview={preview} />
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}

function DoneScreen({ t, onUndo, onClose }: { t: T; onUndo: () => void; onClose: () => void }) {
  return (
    <ModalShell>
      <ConfirmModal strTitle={t('setup_wizard_title')} strOKButtonText={t('close')} bAlertDialog onOK={onClose} onCancel={onClose} onEscKeypress={onClose}>
        <style>{STYLE}</style>
        <Steps t={t} step='done' />
        <Focusable style={{ padding: '0 4px' }}>
          <div className='ds-setup-hero'>
            <CheckIcon size={36} />
            <div style={{ fontSize: 17, fontWeight: 700 }}>{t('setup_done_title')}</div>
            <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 420 }}>{t('setup_done_body')}</div>
          </div>
          <DialogButton style={btnRow} onClick={onUndo} onOKButton={onUndo} onOKActionDescription={t('setup_revert_last')}>
            <RestoreIcon size={14} /> {t('setup_undo')}
          </DialogButton>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}

function ChooseScreen({ t, recommended, canRevert, onPick, onRevert, onClose }: { t: T; recommended: string[]; canRevert: boolean; onPick: (p: SetupPack) => void; onRevert: () => void; onClose: () => void }) {
  return (
    <ModalShell>
      <ConfirmModal strTitle={t('setup_wizard_title')} strDescription={t('setup_wizard_desc')} strOKButtonText={t('close')} bAlertDialog onOK={onClose} onCancel={onClose} onEscKeypress={onClose}>
        <style>{STYLE}</style>
        <Steps t={t} step='choose' />
        <Focusable {...flowChildrenProps('vertical')} style={{ padding: '0 2px', display: 'flex', flexDirection: 'column' }}>
          {GROUPS.map((group) => {
            const GIcon = GROUP_ICON[group]
            return (
              <div key={group}>
                <div className='ds-setup-group'><GIcon size={12} />{t(GROUP_KEY[group])}</div>
                <Focusable {...flowChildrenProps('horizontal')} className='ds-setup-grid'>
                  {SETUP_PACKS.filter((p) => p.group === group).map((pack) => (
                    <PackTile key={pack.id} t={t} pack={pack} recommended={recommended.includes(pack.id)} onPick={() => onPick(pack)} />
                  ))}
                </Focusable>
              </div>
            )
          })}
          {canRevert && (
            <DialogButton style={{ ...btnRow, minHeight: 34, marginTop: 10 }} onClick={onRevert} onOKButton={onRevert} onOKActionDescription={t('setup_revert_last')}>
              <RestoreIcon size={14} /> {t('setup_revert_last')}
            </DialogButton>
          )}
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}

function SetupWizardBody({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t: rawT, settings, actions } = controller
  const t = rawT as unknown as T
  const [step, setStep] = useState<Step>('choose')
  const [selected, setSelected] = useState<SetupPack | null>(null)
  const [recommended, setRecommended] = useState<string[]>([])
  const hasShelves = (settings?.shelves?.length ?? 0) > 0
  useEffect(() => {
    let alive = true
    void (async () => {
      let hints: Array<{ templateId?: string; smartMode?: string }> = []
      try { hints = await resolveStatSuggestions({ max: 12 }) } catch {}
      if (alive) setRecommended(recommendedPackIds(hints, hasShelves))
    })()
    return () => { alive = false }
  }, [hasShelves])
  const preview = useMemo(() => (selected && settings ? previewSetupPack(settings, selected) : null), [selected, settings])
  const canRevert = !!(settings as any)?.lastSetupApply
  const pick = (pack: SetupPack) => { setSelected(pack); setStep('review') }
  const apply = async () => {
    if (!selected) return
    await (actions as any).applySetupPack(selected.id)
    try { await (actions as any).setSetupWizardSeen?.(true) } catch {}
    setStep('done')
  }
  const revert = async () => { await (actions as any).revertSetupPack(); closeModal?.() }
  const close = () => closeModal?.()

  if (step === 'review' && selected && preview) return <ReviewScreen t={t} pack={selected} preview={preview} onApply={apply} onBack={() => setStep('choose')} />
  if (step === 'done') return <DoneScreen t={t} onUndo={revert} onClose={close} />
  return <ChooseScreen t={t} recommended={recommended} canRevert={canRevert} onPick={pick} onRevert={revert} onClose={close} />
}
