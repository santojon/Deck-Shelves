import React from 'react'
import { Field, DialogButton, Focusable } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'
import { DocSection } from './DocSection'

const KOFI_URL = 'https://ko-fi.com/F2F61WE76V'
const GITHUB_URL = 'https://github.com/santojon/Deck-Shelves'
const ISSUES_URL = 'https://github.com/santojon/Deck-Shelves/issues'
const RELEASES_URL = 'https://github.com/santojon/Deck-Shelves/releases'
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }
const subheadingStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#dcdedf' }

const openInBrowser = (url: string) => {
  try { (window as any).SteamClient?.System?.OpenInSystemBrowser?.(url) }
  catch (e) { console.warn('OpenInSystemBrowser failed', e) }
}

export function SupportPage() {
  const { t } = useTranslation()
  const openKofi = () => openInBrowser(KOFI_URL)
  const openGitHub = () => openInBrowser(GITHUB_URL)
  const openIssues = () => openInBrowser(ISSUES_URL)
  const openReleases = () => openInBrowser(RELEASES_URL)
  const limitations = [t('about_limitation_deck_only'), t('about_limitation_decky'), t('about_limitation_home')]
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_learn_more_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_learn_more_description')}</span>} />
      <Field bottomSeparator="none" childrenLayout="below">
        {/* `flow-children="horizontal"` tells the Decky/Steam gamepad nav
            tree to move L/R between these buttons instead of U/D — without
            it the buttons render side-by-side visually but D-pad navigates
            top-to-bottom (the default Focusable flow). */}
        <Focusable
          flow-children="horizontal"
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
            onClick={openIssues}
            onOKButton={openIssues}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_report_issue')}
          </DialogButton>
        </Focusable>
      </Field>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_support_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_support_description')}</span>} />
      <Field bottomSeparator="none" childrenLayout="below">
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
      </Field>
      <Field focusable={true} bottomSeparator="none" label={<span style={subheadingStyle}>{t('about_limitations_title')}</span>} />
      {limitations.map((l, i) => (
        <Field key={i} focusable={true} bottomSeparator="none" label={<span style={labelStyle}>• {l}</span>} />
      ))}
      <Field
        focusable={true}
        bottomSeparator="none"
        description={
          <span style={{ ...labelStyle, textAlign: 'center', fontSize: 11, color: '#666' }}>
            {t('about_version')}: {pkg.version}
            {' · '}
            <a
              role="button"
              tabIndex={0}
              onClick={openReleases}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openReleases() }}
              style={{ color: '#7aa9d6', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('about_other_versions')}
            </a>
          </span>
        }
      />
    </DocSection>
  )
}
