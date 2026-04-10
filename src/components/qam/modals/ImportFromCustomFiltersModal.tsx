import React, { useEffect, useState } from 'react'
import { ConfirmModal, Field, DialogButton } from '@decky/ui'
import { toaster } from '@decky/api'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import type { SettingsController } from '../../features/settings/controller'
import { getTabMasterTabsFromSettingsFile, extractTabMasterTabsForImport, tabContainerToShelfSource } from '../../../integrations'
import { findTabMasterContextValue } from '../../../steam'

export function ImportFromCustomFiltersModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const [tabs, setTabs] = useState<{ id: string; title: string; source?: any }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTabs = async () => {
      setLoading(true)
      setError(null)
      try {
        const entries = await getTabMasterTabsFromSettingsFile()
        if (entries.length > 0) {
          setTabs(entries.map((t) => ({
            id: t.id,
            title: t.title,
            source: t.filters && t.filters.length > 0
              ? tabContainerToShelfSource({ id: t.id, title: t.title, filters: t.filters })
              : { type: 'tab', tab: t.id },
          })))
          setLoading(false)
          return
        }
      } catch (e) {}

      let manager: any = null
      try {
        const ctx = findTabMasterContextValue()
        if (ctx && (Array.isArray(ctx.visibleTabsList) || ctx.tabsMap instanceof Map)) manager = ctx
      } catch (e) {}
      if (!manager) {
        try {
          const gm = (globalThis as any)
          for (const k of Object.keys(gm)) {
            const v = gm[k]
            if (v && (Array.isArray(v?.visibleTabsList) || v?.tabsMap instanceof Map)) { manager = v; break }
          }
        } catch (e) {}
      }
      if (manager) {
        try {
          const extracted = extractTabMasterTabsForImport(manager)
          if (extracted.length > 0) {
            setTabs(extracted.map((t: any) => ({ id: t.id, title: t.title, source: t.source })))
            setLoading(false)
            return
          }
        } catch (e) {}
      }

      setLoading(false)
      setError(t('toast_failed_import'))
    }
    loadTabs()
  }, [])

  const doImport = async (entry: { id: string; title: string; source?: any }) => {
    try {
      const src = entry.source ?? { type: 'tab', tab: entry.id }
      const shelfSource = (src.type === 'tab' || src.type === 'collection' || src.type === 'filter') ? src : tabContainerToShelfSource(src)
      await actions.addShelfWith(entry.title, shelfSource)
      toaster.toast({ title: t('pluginName'), body: `${t('toast_imported')}: ${entry.title}` })
      closeModal?.()
    } catch (e) {
      toaster.toast({ title: t('pluginName'), body: String(e) })
    }
  }

  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('import_from_tabmaster')}
        strDescription={t('import_from_tabmaster_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <div style={{ padding: 8 }}>
          {loading ? (
            <div>{t('loading')}</div>
          ) : error && tabs.length === 0 ? (
            <div style={{ color: '#f59e0b' }}>{error}</div>
          ) : tabs.length === 0 ? (
            <div>{t('no_tabmaster_tabs')}</div>
          ) : (
            <div>
              {tabs.map((tab) => (
                <Field key={tab.id} label={tab.title}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DialogButton onClick={() => doImport(tab)} onOKButton={() => doImport(tab)} onOKActionDescription={t('import')}>{t('import')}</DialogButton>
                  </div>
                </Field>
              ))}
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  )
}
