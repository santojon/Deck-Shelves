import { Focusable, DialogButton } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'
import { DocSection } from './DocSection'

const KOFI_URL = 'https://ko-fi.com/F2F61WE76V'

export function SupportPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{t('about_support_title')}</div>
      <div style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8 }}>{t('about_support_description')}</div>
      <Focusable style={{ marginTop: 8, marginBottom: 16 }}>
        <DialogButton
            onClick={() => { try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(KOFI_URL) } catch (e) { console.warn('OpenInSystemBrowser failed', e) } }}
            onOKButton={() => { try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(KOFI_URL) } catch (e) { console.warn('OpenInSystemBrowser failed', e) } }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', minWidth: 0 }}
        >
          <svg viewBox='0 0 24 24' fill='none' style={{ width: 18, height: 18, marginRight: 8, flexShrink: 0 }}>
            <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' fill='#ff5e5b' />
          </svg>
          Ko-fi
        </DialogButton>
      </Focusable>

      <div style={{ fontSize: 15, fontWeight: 700, color: '#dcdedf', marginBottom: 8, marginTop: 18 }}>{t('about_limitations_title')}</div>
      {[
        t('about_limitation_deck_only'),
        t('about_limitation_decky'),
        t('about_limitation_home'),
      ].map((l, i) => (
        <div key={i} style={{ fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 4, paddingLeft: 10 }}>• {l}</div>
      ))}

      <div style={{ marginTop: 24, fontSize: 11, color: '#666', textAlign: 'center' }}>{t('about_version')}: {pkg.version}</div>
    </DocSection>
  )
}
