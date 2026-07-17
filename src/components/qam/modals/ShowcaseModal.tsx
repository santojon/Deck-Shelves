import { useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '../../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { ModalShell } from '../../ui'
import { DeckShelvesLogo, StackIcon, SparkleIcon, FunnelIcon, WandIcon, SearchIcon, SlidersIcon, TargetIcon, OnlineIcon, ToolsIcon } from '../../icons'

type Glyph = (p: { size?: number }) => any
type Step = { Icon: Glyph; title: string; body: string }

const STEPS: Step[] = [
  { Icon: DeckShelvesLogo, title: 'showcase_welcome_title', body: 'showcase_welcome_body' },
  { Icon: StackIcon, title: 'showcase_shelves_title', body: 'showcase_shelves_body' },
  { Icon: SparkleIcon, title: 'showcase_smart_title', body: 'showcase_smart_body' },
  { Icon: FunnelIcon, title: 'showcase_filters_title', body: 'showcase_filters_body' },
  { Icon: WandIcon, title: 'showcase_customization_title', body: 'showcase_customization_body' },
  { Icon: SearchIcon, title: 'showcase_search_title', body: 'showcase_search_body' },
  { Icon: SlidersIcon, title: 'showcase_sidenav_title', body: 'showcase_sidenav_body' },
  { Icon: TargetIcon, title: 'showcase_profiles_title', body: 'showcase_profiles_body' },
  { Icon: OnlineIcon, title: 'showcase_online_title', body: 'showcase_online_body' },
  { Icon: ToolsIcon, title: 'showcase_tools_title', body: 'showcase_tools_body' },
]

/* First-run guided tour of the main features. Shown once (marked via
   `onComplete`) and replayable from the AboutPage. Skip and Finish both end
   the tour; the physical Menu button advances like every other modal. */
export function ShowcaseModal({ closeModal, onComplete }: { closeModal?: () => void; onComplete?: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const end = () => { try { onComplete?.() } catch {} ; closeModal?.() }
  const next = () => { if (last) end(); else setStep((s) => s + 1) }
  const cur = STEPS[step]
  const Icon = cur.Icon
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={''}
        strOKButtonText={last ? t('showcase_finish') : t('showcase_next')}
        strCancelButtonText={t('showcase_skip')}
        onOK={next}
        onCancel={end}
        onEscKeypress={end}
      >
        <Focusable onMenuButton={next} onMenuActionDescription={last ? t('showcase_finish') : t('showcase_next')}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '10px 6px 4px' }}>
            {/* Centered tour title — rendered in-body because the ConfirmModal
                DialogHeader (strTitle) is left-aligned. */}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', opacity: 0.55, width: '100%', textAlign: 'center' }}>{t('showcase_title')}</div>
            <div style={{ color: 'var(--ds-accent, #4a9eff)', display: 'flex' }}><Icon size={44} /></div>
            <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', width: '100%' }}>{t(cur.title)}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85, maxWidth: 460 }}>{t(cur.body)}</div>
            <div style={{ display: 'flex', gap: 6, padding: '4px 0 2px' }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i === step ? 'var(--ds-accent, #4a9eff)' : 'rgba(255,255,255,0.25)' }} />
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('showcase_progress', { current: step + 1, total: STEPS.length })}</div>
            {step > 0 && (
              <DialogButton style={{ minWidth: 120, marginTop: 2 }} onClick={() => setStep((s) => Math.max(0, s - 1))} onOKButton={() => setStep((s) => Math.max(0, s - 1))}>
                ← {t('showcase_back')}
              </DialogButton>
            )}
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
