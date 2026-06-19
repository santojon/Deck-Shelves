import { useEffect, useState } from 'react'
import { ConfirmModal, DialogButton, Focusable, toaster } from '../../../runtime/host/decky'
import { ModalShell } from '../../ui'
import type { SettingsController } from '../../../features/settings/controller'
import { getTabMasterTabsFromSettingsFile, extractTabMasterTabsForImport, tabContainerToShelfSource } from '../../../integrations'
import { findTabMasterContextValue } from '../../../steam'
import { ChevronIcon, SteamIcon } from '../../icons'

type ImportTab = { id: string; title: string; source?: any; isSteam: boolean; hidden: boolean }

export function ImportFromCustomFiltersModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const [tabs, setTabs] = useState<ImportTab[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTabs, setShowTabs] = useState(true)
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    const loadTabs = async () => {
      setLoading(true)
      setError(null)
      try {
        const entries = await getTabMasterTabsFromSettingsFile()
        if (entries.length > 0) {
          setTabs(entries.map((e) => {
            const isSteam = !e.filters || e.filters.length === 0
            return {
              id: e.id,
              title: e.title,
              isSteam,
              hidden: e.position < 0,
              source: !isSteam
                ? tabContainerToShelfSource({ id: e.id, title: e.title, filters: e.filters })
                : { type: 'tab', tab: e.id },
            }
          }))
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
            setTabs(extracted.map((x: any) => ({
              id: x.id, title: x.title, source: x.source,
              isSteam: x.source?.type === 'tab',
              hidden: false,
            })))
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

  const doImport = async (entry: ImportTab) => {
    try {
      const src = entry.source ?? { type: 'tab', tab: entry.id }
      const shelfSource = (src.type === 'tab' || src.type === 'collection' || src.type === 'filter') ? src : tabContainerToShelfSource(src)
      await actions.addShelfWith(entry.title, shelfSource)
      toaster.toast({ title: t('plugin_name'), body: `${t('toast_imported')}: ${entry.title}` })
      closeModal?.()
    } catch (e) {
      toaster.toast({ title: t('plugin_name'), body: String(e) })
    }
  }

  const visibleTabs = tabs.filter((x) => !x.hidden)
  const hiddenTabs = tabs.filter((x) => x.hidden)

  const renderTile = (tab: ImportTab) => (
    <DialogButton
      key={tab.id}
      onClick={() => doImport(tab)}
      onOKButton={() => doImport(tab)}
      onOKActionDescription={t('import')}
      style={{ width: '100%', minHeight: 44, fontSize: 13, padding: '8px 6px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        {tab.isSteam && <SteamIcon />}
        <span>{tab.title}</span>
      </span>
    </DialogButton>
  )

  const sectionHeader = (label: string, count: number, open: boolean, toggle: () => void) => (
    <Focusable onClick={toggle} onOKButton={toggle}>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
          {label}
          {count > 0 && <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>({count})</span>}
        </div>
        <div style={{ flexGrow: 1, height: 1, background: 'rgba(255,255,255,0.2)' }} />
        <ChevronIcon open={open} />
      </div>
    </Focusable>
  )

  return (
    <ModalShell>
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
            <div style={{ color: 'var(--ds-warn, #f59e0b)' }}>{error}</div>
          ) : tabs.length === 0 ? (
            <div>{t('no_tabmaster_tabs')}</div>
          ) : (
            <>
              {sectionHeader(t('tabmaster_section_tabs'), visibleTabs.length, showTabs, () => setShowTabs((v) => !v))}
              {showTabs && visibleTabs.length > 0 && (
                <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0' }}>
                  {visibleTabs.map(renderTile)}
                </Focusable>
              )}
              {hiddenTabs.length > 0 && (
                <>
                  {sectionHeader(t('tabmaster_section_hidden'), hiddenTabs.length, showHidden, () => setShowHidden((v) => !v))}
                  {showHidden && (
                    <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0' }}>
                      {hiddenTabs.map(renderTile)}
                    </Focusable>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ConfirmModal>
    </ModalShell>
  )
}
