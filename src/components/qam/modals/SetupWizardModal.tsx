import { useEffect, useMemo, useState } from 'react'
import { ConfirmModal, DialogButton, Focusable } from '../../../runtime/host/decky'
import { ModalShell } from '../../ui'
import type { SettingsController } from '../../../features/settings/controller'
import { SETUP_PACKS, previewSetupPack, recommendedPackIds, type SetupPack, type SetupPackGroup } from '../../../domain/setupPacks'
import { resolveStatSuggestions } from '../../../core/statSuggestions'

const GROUPS: SetupPackGroup[] = ['quick', 'pack', 'device']
const GROUP_KEY: Record<SetupPackGroup, string> = { quick: 'setup_group_quick', pack: 'setup_group_pack', device: 'setup_group_device' }
// Settings a pack may turn on → their existing labels.
const SETTING_LABEL: Record<string, string> = {
  shelfHeroBackground: 'shelf_hero_background',
  globalHighlightFirst: 'highlight_first',
  smartShelvesEnabled: 'smart_shelves_enabled',
}
const btnStyle: React.CSSProperties = { width: '100%', minHeight: 44, fontSize: 13, padding: '8px 10px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px', textAlign: 'left' }

/* Setup wizard: pick a pack (quick preset, situation pack or device pack),
   see exactly what it adds, apply. Non-destructive (existing shelves kept,
   covered templates skipped) and revertible in one step from the same place;
   re-openable from the QAM at any time, so nobody has to get it right on
   the first boot. */
export function SetupWizardModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, settings, actions } = controller
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
  const apply = async () => {
    if (!selected) return
    await (actions as any).applySetupPack(selected.id)
    try { await (actions as any).setSetupWizardSeen?.(true) } catch {}
    closeModal?.()
  }
  const revert = async () => { await (actions as any).revertSetupPack(); closeModal?.() }

  if (selected && preview) {
    return (
      <ModalShell>
        <ConfirmModal strTitle={t(`setup_pack_${selected.id}_title` as any)} strDescription={t('setup_preview_title' as any)} strOKButtonText={t('setup_apply' as any)} strCancelButtonText={t('setup_back' as any)} onOK={apply} onCancel={() => setSelected(null)}>
          <Focusable onMenuButton={apply} onMenuActionDescription={t('setup_apply' as any)} style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {preview.shelves.map((s) => (
              <div key={s.templateId} style={{ fontSize: 13, opacity: s.already ? 0.5 : 1 }}>• {t(s.titleKey as any)}{s.already ? ` · ${t('setup_preview_have' as any)}` : ''}</div>
            ))}
            {preview.smart.map((s) => (
              <div key={s.mode} style={{ fontSize: 13, opacity: s.already ? 0.5 : 1 }}>✦ {t(`smart_template_${s.mode}` as any)}{s.already ? ` · ${t('setup_preview_have' as any)}` : ''}</div>
            ))}
            {preview.settings.map((c) => (
              <div key={c.key} style={{ fontSize: 12, opacity: 0.8 }}>{t('setup_preview_setting' as any, { name: t((SETTING_LABEL[c.key] ?? c.key) as any) })}</div>
            ))}
          </Focusable>
        </ConfirmModal>
      </ModalShell>
    )
  }

  return (
    <ModalShell>
      <ConfirmModal strTitle={t('setup_wizard_title' as any)} strDescription={t('setup_wizard_desc' as any)} strOKButtonText={t('close')} onOK={() => closeModal?.()} onCancel={() => closeModal?.()}>
        <Focusable style={{ padding: 8 }}>
          {GROUPS.map((group) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7, padding: '4px 2px' }}>{t(GROUP_KEY[group] as any)}</div>
              {SETUP_PACKS.filter((p) => p.group === group).map((pack) => (
                <DialogButton key={pack.id} style={{ ...btnStyle, marginBottom: 6 }} onClick={() => setSelected(pack)} onOKButton={() => setSelected(pack)} onOKActionDescription={t(`setup_pack_${pack.id}_title` as any)}>
                  <div style={{ fontWeight: 700 }}>{t(`setup_pack_${pack.id}_title` as any)}{recommended.includes(pack.id) ? ` · ${t('setup_recommended' as any)}` : ''}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{t(`setup_pack_${pack.id}_desc` as any)}</div>
                </DialogButton>
              ))}
            </div>
          ))}
          {canRevert && (
            <DialogButton style={btnStyle} onClick={revert} onOKButton={revert} onOKActionDescription={t('setup_revert_last' as any)}>
              {t('setup_revert_last' as any)}
            </DialogButton>
          )}
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
