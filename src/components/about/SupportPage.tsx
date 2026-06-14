import React from 'react'
import { Field, DialogButton, Focusable } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'
import { DocSection } from './DocSection'
import { flowChildrenProps } from '../../core/steamOSVersion'

const KOFI_URL = 'https://ko-fi.com/F2F61WE76V'
const GITHUB_URL = 'https://github.com/santojon/Deck-Shelves'
const ISSUES_URL = 'https://github.com/santojon/Deck-Shelves/issues'
const RELEASES_URL = 'https://github.com/santojon/Deck-Shelves/releases'

// Ko-fi QR encoded inline as a data URL — the asset itself lives in
// `assets/kofi-qr.png`. Inlining (1078 B → ~1440 B b64) sidesteps the
// Decky-vs-standalone asset-loading dance and works in every host
// because data: URLs are first-class on Chromium.
const KOFI_QR_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAzQAAAM0AQMAAABXvPU0AAAABlBMVEUAAAD///+l2Z/dAAAD60lEQVR4nO3dUXLbMAwEUN3A979lb5BOW2dIAqBUfzgN1McPTxxbXA0G2F2BEn18fMn4ccARN3mgfvABHqUL9JQ/4Kv4RP7a9YLrLNeNrrf1D/Rd9JH03/QT3zn0YcVNHqgffIBH6QI95Q/4qu/iE484Hn++cfx+md+GIx6//nrsJoAjbvJA/eADPEoXWuvp+P/n24CYsJfpqgngiJs8UD/4AI/Shf56GqxFmnMxGcmHVBPAETd5oH7wAR6lCzfT0+plHksXA464yQP1gw/wKF34T/T0eM40Jr46FTjiJg/UDz7Ao3ThZnpavX2CDZzwweJD6vngiJs8UD/4AI/Shf56WoxnLNhV4LcLEqW6sEjnX+kVhCMCJg/UDz7Ao3Shr55C/9LXMcfQXMTvBVgIRMgRMHmgfvABHqUL3fW0HMcwWxbDh5dXMezGEzD1QPzNg/eADPEoXWulpsP7Q1aVk1uRoBfnTNAm44ggHkwfqBx/gUbrQVU+rt0+wgRM+WHxIPR8ccZMH6gcf4FG60FVPq5d5LF0MOOImD9QPPsCjdKG1nlYjHDh7jjHT4k3qAUfc5IH6wQd4lC701dMy67Rk5L0xVOJWvjVtP8aBgPQNXg+OuMkD9YMP8Chd6KqnNF93sNiziH3hT2kEMG7QSWICTjiJg/UDz7Ao3Shp56OmShzVOnCVVrA3PiW5O5ImDzAcM2dT1IkS+3VAxV6elHV+plHksXA464yQP1gw/wKF1orafVCAfOnmPMtHiTesARN3mgfvABHqULXfU0P/8wz55HOp9q5QOOuMkD9YMP8ChcaKyns7VY/pe8ydlXqrOAI27yQP3gAzxKF/rq6bzusHw3uYr9gxHhLRxxkwfqBx/gUbrQWk9PRt5sYWBX90ue+hA44iYP1A8+wKN0oY+e1oYiTBxWNMbCxSv7NMIRN3mgfvABHqUL/fQ0uY/HSe8inEV9WyQccZMH6gcf4FG60FNPt9s1J7Blka7FsLbx2j4LcMRNHqgffIBH6cJ31NPt1kppd4UFp3YuYcARN3mgfvABHqULPfU0OYjctqiMR+hTJAsCR9zkgfrBB3iULjTW03FoelIyWJDQrMh3PFz0KeCImzxQP/gAj9KFVnoaeg1hpvl7m/scwqdwxE0eqB98gEfpQms9nY9aFi5mxOdR0ZGsc/7FfZBwxE0eqB98gEfpQgs9TY9QVjc0Vtstnbk0OOImD9QPPsCjdOE2enr5E5EVbMA+fU4CjrjJA/WDD/AoXeikp8NVLBsvzX+lmximDRyrU4YjbvJA/eADPEoX+upp+M3ovPFSZUvGsadrG3DETR6oH3yAR+lCRz2txhYsrV6cP0wJR9zkgfrBB3iULvTU09lLZB8SpiV7M+U9nOYBR9zkgfrBB3iULnTV0/wzj7X7yGsW244FHHGTB+oHH+BRutBfT5Or2PwI5Jgs7edYmxY44iYP1A8+wKN04T56utwbWZ3F/JVXfgcKjrjJA/WDD/AoXWiqp8mCLHZjNCtSA+PqOUo44iYP1A8+wKN0oY+eJtjLOxkGWDgBOOImD9QPPsCjdOEOehrGdlum6nw2n8IRN3mgfvABHqULrfX0nQOOuMkD9YMP8ChdoKf8AV/FJ/LXrhdcZ7ludL2tf6Dvoo+k/6af+N6hDytu8kD94AM8ShfoKX/AV338S5/4E3wgNMyixE2eAAAAAElFTkSuQmCC'
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
      {/* Sprint 10 PR3 — Ko-fi card with scannable QR.
          Layout: QR on the left (scan from phone), tagline + button
          on the right ("scan or click"). Matches the WineCellar /
          SDH-PlayTime pattern of pairing the QR with the action so
          either input modality works without leaving the page. */}
      <Field bottomSeparator="none" childrenLayout="below">
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(255, 94, 91, 0.08)',
          border: '1px solid rgba(255, 94, 91, 0.25)',
          boxSizing: 'border-box',
          maxWidth: '100%',
        }}>
          <img
            src={KOFI_QR_DATA_URL}
            alt='Ko-fi QR code'
            style={{
              width: 112,
              height: 112,
              boxSizing: 'border-box',
              imageRendering: 'pixelated',
              background: 'white',
              padding: 6,
              borderRadius: 6,
              flexShrink: 0,
              display: 'block',
            }}
          />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#dcdedf', lineHeight: 1.4 }}>
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
