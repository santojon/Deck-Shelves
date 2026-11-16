import React from 'react'
import { Field, DialogButton, Focusable } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'
import { DocSection } from './DocSection'
import { flowChildrenProps } from '../../core/steamOSVersion'
import { logInfo } from '../../runtime/logger'
import { openManagedModal } from '../qam/common/openManagedModal'
import { ShowcaseModal } from '../../features/setup/ShowcaseModal'
import { openIssueReport } from '../../core/issueReport'
import { KOFI_URL, GITHUB_REPO, GITHUB_RELEASES, REDDIT_COMMUNITY, DISCORD_INVITE } from '../../constants'

const GITHUB_URL = GITHUB_REPO
const RELEASES_URL = GITHUB_RELEASES
const RELEASE_NOTES_URL = `${GITHUB_RELEASES}/tag/v${pkg.version}`
const DISCORD_URL = DISCORD_INVITE
const REDDIT_URL = REDDIT_COMMUNITY

// The Ko-fi QR code as one SVG path: 29 x 29 modules inside a 4-module white margin.
const KOFI_QR_PATH = 'M4,4h7v1h-7zM13,4h1v1h-1zM17,4h3v1h-3zM23,4h1v1h-1zM26,4h7v1h-7zM4,5h1v1h-1zM10,5h1v1h-1zM13,5h3v1h-3zM17,5h4v1h-4zM22,5h1v1h-1zM26,5h1v1h-1zM32,5h1v1h-1zM4,6h1v1h-1zM6,6h3v1h-3zM10,6h1v1h-1zM12,6h2v1h-2zM15,6h3v1h-3zM19,6h1v1h-1zM23,6h2v1h-2zM26,6h1v1h-1zM28,6h3v1h-3zM32,6h1v1h-1zM4,7h1v1h-1zM6,7h3v1h-3zM10,7h1v1h-1zM12,7h1v1h-1zM16,7h1v1h-1zM18,7h2v1h-2zM24,7h1v1h-1zM26,7h1v1h-1zM28,7h3v1h-3zM32,7h1v1h-1zM4,8h1v1h-1zM6,8h3v1h-3zM10,8h1v1h-1zM12,8h1v1h-1zM16,8h1v1h-1zM19,8h2v1h-2zM23,8h1v1h-1zM26,8h1v1h-1zM28,8h3v1h-3zM32,8h1v1h-1zM4,9h1v1h-1zM10,9h1v1h-1zM12,9h2v1h-2zM16,9h1v1h-1zM21,9h1v1h-1zM26,9h1v1h-1zM32,9h1v1h-1zM4,10h7v1h-7zM12,10h1v1h-1zM14,10h1v1h-1zM16,10h1v1h-1zM18,10h1v1h-1zM20,10h1v1h-1zM22,10h1v1h-1zM24,10h1v1h-1zM26,10h7v1h-7zM12,11h3v1h-3zM18,11h1v1h-1zM20,11h1v1h-1zM23,11h2v1h-2zM4,12h1v1h-1zM6,12h5v1h-5zM15,12h1v1h-1zM20,12h1v1h-1zM26,12h5v1h-5zM4,13h2v1h-2zM7,13h2v1h-2zM13,13h1v1h-1zM17,13h3v1h-3zM22,13h1v1h-1zM24,13h5v1h-5zM32,13h1v1h-1zM4,14h2v1h-2zM8,14h1v1h-1zM10,14h4v1h-4zM15,14h1v1h-1zM17,14h4v1h-4zM25,14h2v1h-2zM4,15h4v1h-4zM12,15h3v1h-3zM16,15h2v1h-2zM19,15h1v1h-1zM23,15h1v1h-1zM27,15h3v1h-3zM31,15h1v1h-1zM4,16h1v1h-1zM6,16h8v1h-8zM15,16h2v1h-2zM18,16h2v1h-2zM21,16h2v1h-2zM24,16h2v1h-2zM29,16h2v1h-2zM4,17h4v1h-4zM12,17h1v1h-1zM15,17h1v1h-1zM19,17h2v1h-2zM23,17h1v1h-1zM25,17h4v1h-4zM32,17h1v1h-1zM4,18h2v1h-2zM9,18h5v1h-5zM15,18h1v1h-1zM21,18h1v1h-1zM26,18h5v1h-5zM5,19h2v1h-2zM11,19h2v1h-2zM15,19h1v1h-1zM18,19h1v1h-1zM20,19h1v1h-1zM23,19h5v1h-5zM31,19h1v1h-1zM5,20h1v1h-1zM9,20h2v1h-2zM12,20h2v1h-2zM20,20h3v1h-3zM29,20h2v1h-2zM4,21h4v1h-4zM11,21h1v1h-1zM13,21h3v1h-3zM17,21h3v1h-3zM24,21h3v1h-3zM28,21h1v1h-1zM30,21h1v1h-1zM32,21h1v1h-1zM4,22h1v1h-1zM6,22h5v1h-5zM14,22h2v1h-2zM17,22h5v1h-5zM24,22h2v1h-2zM27,22h1v1h-1zM30,22h1v1h-1zM4,23h1v1h-1zM7,23h2v1h-2zM11,23h1v1h-1zM13,23h1v1h-1zM17,23h1v1h-1zM19,23h1v1h-1zM22,23h3v1h-3zM26,23h2v1h-2zM31,23h1v1h-1zM4,24h1v1h-1zM6,24h1v1h-1zM9,24h3v1h-3zM14,24h3v1h-3zM18,24h2v1h-2zM23,24h6v1h-6zM30,24h3v1h-3zM12,25h1v1h-1zM14,25h2v1h-2zM19,25h2v1h-2zM24,25h1v1h-1zM28,25h5v1h-5zM4,26h7v1h-7zM14,26h2v1h-2zM21,26h1v1h-1zM23,26h2v1h-2zM26,26h1v1h-1zM28,26h3v1h-3zM4,27h1v1h-1zM10,27h1v1h-1zM12,27h3v1h-3zM18,27h1v1h-1zM20,27h1v1h-1zM22,27h1v1h-1zM24,27h1v1h-1zM28,27h1v1h-1zM31,27h1v1h-1zM4,28h1v1h-1zM6,28h3v1h-3zM10,28h1v1h-1zM12,28h1v1h-1zM15,28h2v1h-2zM20,28h1v1h-1zM22,28h1v1h-1zM24,28h5v1h-5zM30,28h1v1h-1zM32,28h1v1h-1zM4,29h1v1h-1zM6,29h3v1h-3zM10,29h1v1h-1zM12,29h2v1h-2zM16,29h1v1h-1zM18,29h2v1h-2zM21,29h3v1h-3zM29,29h2v1h-2zM4,30h1v1h-1zM6,30h3v1h-3zM10,30h1v1h-1zM12,30h3v1h-3zM16,30h2v1h-2zM19,30h3v1h-3zM23,30h9v1h-9zM4,31h1v1h-1zM10,31h1v1h-1zM13,31h1v1h-1zM15,31h1v1h-1zM19,31h1v1h-1zM21,31h2v1h-2zM24,31h1v1h-1zM26,31h2v1h-2zM29,31h1v1h-1zM31,31h1v1h-1zM4,32h7v1h-7zM12,32h3v1h-3zM17,32h1v1h-1zM19,32h1v1h-1zM23,32h1v1h-1zM26,32h1v1h-1zM30,32h1v1h-1z'
const KOFI_QR_DATA_URL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 37 37' shape-rendering='crispEdges'%3E%3Crect width='37' height='37' fill='white'/%3E%3Cpath d='${KOFI_QR_PATH}'/%3E%3C/svg%3E`
const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--ds-text-dim, #b8bcbf)', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--ds-text, #fff)' }

const openInBrowser = (url: string) => {
  try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(url) }
  catch (e) { logInfo('RUNTIME', 'OpenInSystemBrowser failed', String(e)) }
}

export function SupportPage() {
  const { t } = useTranslation()
  const openKofi = () => openInBrowser(KOFI_URL)
  const openGitHub = () => openInBrowser(GITHUB_URL)
  // showModal doesn't overlay a routed full page, so this reports directly.
  const reportBug = () => { void openIssueReport('bug') }
  const reportEnhancement = () => { void openIssueReport('enhancement') }
  const reportFeature = () => { void openIssueReport('feature') }
  const openReleases = () => openInBrowser(RELEASES_URL)
  const openReleaseNotes = () => openInBrowser(RELEASE_NOTES_URL)
  const openDiscord = () => openInBrowser(DISCORD_URL)
  const openReddit = () => openInBrowser(REDDIT_URL)
  const openShowcase = () => openManagedModal((close) => <ShowcaseModal closeModal={close} />)
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_support_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_support_description')}</span>} />
      <div style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        padding: '12px 14px',
        margin: '8px 0',
        borderRadius: 10,
        background: 'var(--ds-support-soft, rgba(255, 94, 91, 0.08))',
        border: '1px solid var(--ds-support-border, rgba(255, 94, 91, 0.25))',
        boxSizing: 'border-box',
        width: '100%',
        overflow: 'hidden',
      }}>
        <div style={{
          width: 128,
          height: 128,
          minWidth: 128,
          flexShrink: 0,
          padding: 8,
          background: 'white',
          borderRadius: 6,
          boxSizing: 'content-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src={KOFI_QR_DATA_URL}
            alt='Ko-fi QR code'
            width={128}
            height={128}
            style={{
              width: 128,
              height: 128,
              display: 'block',
              objectFit: 'contain',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--ds-text, #dcdedf)', lineHeight: 1.4 }}>
            {t('about_kofi_qr_hint')}
          </div>
          <div style={{ display: 'flex' }}>
            <DialogButton
              onClick={openKofi}
              onOKButton={openKofi}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
            >
              <svg viewBox='0 0 24 24' fill='none' style={{ width: 15, height: 15, marginRight: 6, flexShrink: 0 }}>
                <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' fill='#ff5e5b' />
              </svg>
              Ko-fi
            </DialogButton>
          </div>
        </div>
      </div>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_learn_more_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_learn_more_description')}</span>} />
      <Field bottomSeparator="none" childrenLayout="below">
        <Focusable
          {...flowChildrenProps("horizontal")}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <DialogButton
            onClick={openGitHub}
            onOKButton={openGitHub}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_learn_more_github')}
          </DialogButton>
          <DialogButton
            onClick={reportBug}
            onOKButton={reportBug}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_report_bug')}
          </DialogButton>
          <DialogButton
            onClick={reportEnhancement}
            onOKButton={reportEnhancement}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_report_enhancement')}
          </DialogButton>
          <DialogButton
            onClick={reportFeature}
            onOKButton={reportFeature}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_report_feature')}
          </DialogButton>
          <DialogButton
            onClick={openShowcase}
            onOKButton={openShowcase}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('showcase_replay')}
          </DialogButton>
          <DialogButton
            onClick={openDiscord}
            onOKButton={openDiscord}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_discord')}
          </DialogButton>
          <DialogButton
            onClick={openReddit}
            onOKButton={openReddit}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_reddit')}
          </DialogButton>
          <DialogButton
            onClick={openReleaseNotes}
            onOKButton={openReleaseNotes}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_release_notes')}
          </DialogButton>
        </Focusable>
      </Field>
      <Field
        focusable={true}
        bottomSeparator="none"
        description={
          <span style={{ ...labelStyle, textAlign: 'center', fontSize: 11, color: 'var(--ds-text-faint, #666)' }}>
            {t('about_version')}: {pkg.version}
            {' · '}
            <a
              role="button"
              tabIndex={0}
              onClick={openReleases}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openReleases() }}
              style={{ color: 'var(--ds-link, #7aa9d6)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('about_other_versions')}
            </a>
          </span>
        }
      />
    </DocSection>
  )
}
