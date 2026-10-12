import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { ModalShell } from '../../components/ui'
import {
  DeckShelvesLogo, DeckShelvesWordmark, StackIcon, SparkleIcon, FunnelIcon, WandIcon, MonitorIcon, GamepadIcon,
  SearchIcon, SideNavIcon, TargetIcon, OnlineIcon, SlidersIcon, ClockIcon, ToolsIcon,
} from '../../components/icons'

type Glyph = (p: { size?: number }) => any
type Step = { Icon: Glyph; title: string; body: string }

const STEPS: Step[] = [
  { Icon: DeckShelvesLogo, title: 'showcase_welcome_title', body: 'showcase_welcome_body' },
  { Icon: StackIcon, title: 'showcase_shelves_title', body: 'showcase_shelves_body' },
  { Icon: SparkleIcon, title: 'showcase_smart_title', body: 'showcase_smart_body' },
  { Icon: FunnelIcon, title: 'showcase_filters_title', body: 'showcase_filters_body' },
  { Icon: WandIcon, title: 'showcase_customization_title', body: 'showcase_customization_body' },
  { Icon: MonitorIcon, title: 'showcase_layout_title', body: 'showcase_layout_body' },
  { Icon: GamepadIcon, title: 'showcase_shortcuts_title', body: 'showcase_shortcuts_body' },
  { Icon: SearchIcon, title: 'showcase_search_title', body: 'showcase_search_body' },
  { Icon: SideNavIcon, title: 'showcase_sidenav_title', body: 'showcase_sidenav_body' },
  { Icon: TargetIcon, title: 'showcase_profiles_title', body: 'showcase_profiles_body' },
  { Icon: OnlineIcon, title: 'showcase_online_title', body: 'showcase_online_body' },
  { Icon: SlidersIcon, title: 'showcase_stats_title', body: 'showcase_stats_body' },
  { Icon: ClockIcon, title: 'showcase_extras_title', body: 'showcase_extras_body' },
  { Icon: ToolsIcon, title: 'showcase_tools_title', body: 'showcase_tools_body' },
]

/* The welcome screen, then the features two per screen (one card each, so
   every screen fits the dialog without scrolling), then a closing screen with
   the three ways to start — configure now (setup wizard), the default shelves,
   or from scratch. */
const SCREENS: Step[][] = [
  [STEPS[0]],
  [STEPS[1], STEPS[2]], [STEPS[3], STEPS[4]], [STEPS[5], STEPS[6]], [STEPS[7], STEPS[8]],
  [STEPS[9], STEPS[10]], [STEPS[11], STEPS[12]], [STEPS[13]],
]
const FINAL = SCREENS.length // index of the closing choice screen

function StepBlock({ step, hero }: { step: Step; hero: boolean }) {
  const { t } = useTranslation()
  const Icon = step.Icon
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      {hero
        ? <div style={{ display: 'flex', padding: '2px 0' }}><DeckShelvesWordmark width={220} /></div>
        : <div style={{ color: 'var(--ds-accent, #4a9eff)', display: 'flex' }}><Icon size={26} /></div>}
      <div style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', width: '100%', lineHeight: 1.2 }}>{t(step.title)}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.35, opacity: 0.85, maxWidth: 470 }}>{t(step.body)}</div>
    </div>
  )
}

/* First-run guided tour. Shown once (marked via `onComplete`), replayable from
   the AboutPage. Skip jumps to the closing choices (no Skip there; B ends the
   tour); Finish ends it; Back is the dialog's middle button (a row inside the
   body pushed the content past the dialog's top edge); Menu advances. The
   closing choices are wired only when the caller can act on them (the QAM). */
export function ShowcaseModal({ closeModal, onComplete, onConfigure, onDefault }: { closeModal?: () => void; onComplete?: () => void; onConfigure?: () => void; onDefault?: () => void }) {
  const { t } = useTranslation()
  const [screen, setScreen] = useState(0)
  const last = screen === FINAL
  const end = () => { try { onComplete?.() } catch {} ; closeModal?.() }
  const next = () => { if (last) end(); else setScreen((s) => s + 1) }
  const back = () => setScreen((s) => Math.max(0, s - 1))
  const skip = () => setScreen(FINAL)
  const choose = (fn?: () => void) => { end(); try { fn?.() } catch {} }
  const total = SCREENS.length + 1
  return (
    <ModalShell>
      {/* No dialog title: each screen carries its own heading. The wrapper class
          lets the modal stylesheet collapse the empty native header band. */}
      <div className='ds-tour-modal'>
      <ConfirmModal
        strOKButtonText={last ? t('showcase_finish') : t('showcase_next')}
        strCancelButtonText={t('showcase_skip')}
        strMiddleButtonText={screen > 0 ? t('showcase_back') : undefined}
        bAlertDialog={last}
        onOK={next}
        onCancel={last ? end : skip}
        onMiddleButton={screen > 0 ? back : undefined}
        onEscKeypress={last ? end : skip}
      >
        <Focusable onMenuButton={next} onMenuActionDescription={last ? t('showcase_finish') : t('showcase_next')}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '2px 6px 0' }}>
            {last ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t('showcase_final_title' as any)}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.4, opacity: 0.85, maxWidth: 470 }}>{t('showcase_final_body' as any)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 360 }}>
                  {onConfigure && <DialogButton onClick={() => choose(onConfigure)} onOKButton={() => choose(onConfigure)} onOKActionDescription={t('showcase_choice_configure' as any)}>{t('showcase_choice_configure' as any)}</DialogButton>}
                  {onDefault && <DialogButton onClick={() => choose(onDefault)} onOKButton={() => choose(onDefault)} onOKActionDescription={t('showcase_choice_default' as any)}>{t('showcase_choice_default' as any)}</DialogButton>}
                  <DialogButton onClick={() => choose()} onOKButton={() => choose()} onOKActionDescription={t('showcase_choice_scratch' as any)}>{t('showcase_choice_scratch' as any)}</DialogButton>
                </div>
              </>
            ) : SCREENS[screen].map((step, i) => <StepBlock key={step.title} step={step} hero={screen === 0 && i === 0} />)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 0' }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {Array.from({ length: total }, (_, i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: 999, background: i === screen ? 'var(--ds-accent, #4a9eff)' : 'rgba(255,255,255,0.25)' }} />
                ))}
              </div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>{t('showcase_progress', { current: screen + 1, total })}</div>
            </div>
          </div>
        </Focusable>
      </ConfirmModal>
      </div>
    </ModalShell>
  )
}
