import React from 'react'
import { Field, DialogButton, Focusable } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import pkg from '../../../package.json'
import { DocSection } from './DocSection'
import { flowChildrenProps } from '../../core/steamOSVersion'
import { logInfo } from '../../runtime/logger'
import { openManagedModal } from '../qam/common/openManagedModal'
import { ShowcaseModal } from '../qam/modals/ShowcaseModal'
import { openBugReport } from '../../core/issueReport'

const KOFI_URL = 'https://ko-fi.com/F2F61WE76V'
const GITHUB_URL = 'https://github.com/santojon/Deck-Shelves'
const RELEASES_URL = 'https://github.com/santojon/Deck-Shelves/releases'
const DISCORD_URL = 'https://discord.gg/EChuVEDakk'
const REDDIT_URL = 'https://www.reddit.com/r/DeckShelves/'

/* Ko-fi QR encoded inline as a data URL — the asset itself lives in
   `assets/kofi-qr.png`. Inlining (1078 B → ~1440 B b64) sidesteps the
   Decky-vs-standalone asset-loading dance and works in every host
   because data: URLs are first-class on Chromium. */
const KOFI_QR_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAuQAAALkCAIAAADIxrcyAAANRElEQVR42u3ZQY7kNhBFQaah+1/5e+HNADYGZeV0UVRG7AsSU5T6gV1JFgDAU/1lBACAWAEAECsAgFgBABArAABiBQAQKwAAYgUAECsAAGIFAECsAABiBQBArAAAYgUAQKwAAIgVAECsAACIFQBArAAAiBUAALECAIgVAACxAgCIFQAAsQIAIFYAALECACBWAADECgAgVgAAxAoAIFYAAMQKAIBYAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAACIFQBArAAAiBUAQKwAAIgVAACxAgCIFQAAsQIAiBUAALECACBWAACxAgAgVgAAsQIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAAD/dk1bcFV56g+X5Li9seuep70L0+Z84ruAd2E5WQEAln8DAQCIFQAAsQIAiBUAALECAIgVAACxAgAgVgAAsQIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQAGuIzgc0kM4UNVZb325KPm3JnVruv6TtrPLCcrAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAAiBUAQKwAAIgVAECsAAA802UE31FVx91zEnP+wqw69zxtvbv25K71en99J1lOVgAAsQIAIFYAALECACBWAADECgAgVgAAxAoAIFYAAMQKAIBYAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwCAWAEAeKbLCOAfSY67blUdd137ypxhOVkBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAABiBQAQKwAAYgUAECsAAGIFAECsAABiBQBArAAAYgUAQKwAAIgVAOB0lxEA/1eS27+tqi2/7dxzx4n3DMvJCgCAWAEAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAA/N5lBN+RxBAerqo83xe/C7uer71hViwnKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAAiBUAQKwAAIgVAECsAACIFQAAsQIAvM9lBJ+rKkN4sSRb9kbnuie+CyfOedp1fSdZTlYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAABiBQAQKwAAYgUAECsAAGIFAOD3rmkLTuKp85+qyn7mj8/ZvoLlZAUAECsAAGIFAECsAABiBQBArAAAYgUAQKwAAIgVAECsAACIFQBArAAAiBUAALECAIgVAACxAgCIFQAAsQIAIFYAgPepJLMWXHX7t51Zda47jT1pVmZ17px9r1hOVgAAsQIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAABiBQAQKwAAYgUAmKCSzFpw1ZbrduZ84j1P2xsnzmrXvjpxT+7aGyc+o2l7wzdnOVkBABArAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAAiBUAQKwAAIgVAGCmywieL8nt31bVlnvedd0TdWbV2Rtm9fw5n/juT9uTZrWcrAAAiBUAQKwAAIgVAECsAACIFQAAsQIAiBUAALECAIgVAACxAgAgVgAAsQIAIFYAALECACBWAADECgAgVgAAxAoAMFMlmbXgqlHr9Xzf/Yx2rXfXPZ+4n63XO+j7vJysAABiBQBArAAAiBUAQKwAAIgVAECsAACIFQAAsQIAiBUAALECAIgVAACxAgAgVgAAsQIAIFYAALECACBWAADECgDwPpVk1oKrbv+2M6vOdXm+E/eGe3bPP3HPJ37bp81qOVkBABArAIBYAQAQKwAAYgUAECsAAGIFABArAABiBQBArAAAYgUAQKwAAGLFCAAAsQIAIFYAALECACBWAADECgAgVgAA+irJrAVXjVqv5/v8WZ14zye+g9Oer2+d79VysgIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQDECgCAWAEAECsAgFgBABArAIBYAQAQKwAAYgUAECsAAD+nksxacNWW6544512zOlHn+XbmPO393bWffSexN5aTFQAAsQIAiBUAALECAIgVAACxAgAgVgAAsQIAIFYAALECACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQDECgCAWAEA+FUlMYVPh1W15brTntG0OXfWO+2ep81qmhO/dSfuyeVkBQBArAAAYgUAQKwAAIgVAECsAACIFQBArAAAiBUAALECAIgVAACxAgCIFSMAAMQKAIBYAQDECgCAWAEAECsAgFgBAOirJKbw6bCqbv/2xDl31tvRmdWJ98zzn6+9YW94vsvJCgCAWAEAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAA/KqSzFpw1aj1nvh8O8+os94T94b1+l7Zk667nKwAAIgVAACxAgCIFQAAsQIAiBUAALECACBWAACxAgAgVgAAsQIAIFYAAMQKACBWAADECgCAWAEAxAoAgFgBAMQKAMD3XUbwuSS3f1tVW+5513V3zXna851m15x37clp3zpzZjlZAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQBArAAAYgUAQKwAAGIFAECsAACIFQDgFJcRfEeS27+tquPuuaOz3l1z3jWrafv5xD3pm2NWvhvLyQoAIFYAAMQKAIBYAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAO9TSWYtuOr2bzuz2nXdXbPaxayev59PfL7T9saJTtzP096F5WQFABArAABiBQBArAAAYgUAQKwAAGIFAECsAACIFQBArAAAiBUAQKwAAIgVAACxAgCIFQAAsQIAiBUAALECACBWAIA3qSSmwHs2dNXt33behc51O058f83q+ft52t440bS/3U5WAACxAgAgVgAAsQIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQDECgCAWAEAECsAgFgBABArAIBYAQB4nGvagqvKU3+4JFt+y/Of7653v3PPJ35zds3KfmY5WQEAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAgFgBABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAAiBUA4BSXEXwuiSF8qKpGXXfavurMubNe17Unn3bPu/bGcrICACBWAADECgAgVgAAxAoAIFYAAMQKAIBYAQDECgCAWAEAECsAgFgBABArAIBYAQAQKwAAYgUAECsAAGIFABArAAB7XUbwHVV13D0nGfWMdq13197orHfa3vDNMaufeBd2XXc5WQEAECsAgFgBABArAABiBQAQKwAAYgUAECsAAGIFAECsAABiBQBArAAAYsUIAACxAgAgVgAAsQIAIFYAAMQKACBWAAD6LiOAf1TV7d8m2fLbzj3vmlXHtFl11uv9fT7PdzlZAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwAAYgUAECsAAGIFABArAABiBQBArAAAYgUAQKwAAGIFAECsAACIFQDgXJcRQF9V3f5tklH33Llu57cd09bLu9/95WQFAECsAABiBQBArAAAiBUAQKwAAIgVAECsAACIFQAAsQIAiBUAALECAIgVIwAAxAoAgFgBAMQKAIBYAQAQKwCAWAEA6LuM4DuSGMLD51xVo67r+dobP3Fd7y/LyQoAIFYAAMQKAIBYAQDECgCAWAEAxAoAgFgBABArAIBYAQAQKwAAYgUAECsAAGIFABArAABiBQBArAAAYgUAQKwAABNcRvC5qjIEz+iPXzeJe/4Cc373nDvXnfaMlpMVAACxAgCIFQAAsQIAIFYAALECACBWAACxAgAgVgAAxAoAIFYAAMQKACBWjAAAECsAAGIFABArAABiBQBArAAAYgUAoK+SmAIAsJysAACIFQBArAAAiBUAALECAIgVAACxAgCIFQAAsQIAIFYAALECACBWAACxAgAgVgAAxAoAIFYAAMQKACBWAADECgCAWAEAxAoAgFgBAMQKAIBYAQAQKwCAWAEAECsAAGIFABArAABiBQAQKwAAYgUAQKwAAGIFAECsAABiBQBArAAAiBUAQKwAAIgVAECsAACIFQAAsQIAiBUAALECAIgVAACxAgAgVgAAsQIAIFYAAMQKACBWAADECgAgVgAAxAoAgFgBAMQKAIBYAQDECgCAWAEAECsAgFgBABArAIBYAQAQKwAAYgUAECsAAGIFABArAABiBQBArAAAYgUAQKwAAIgVAECsAACIFQBArAAAiBUAALECABzkb8NBQq2BVSslAAAAAElFTkSuQmCC'
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
  const reportIssue = () => { void openBugReport() }
  const openReleases = () => openInBrowser(RELEASES_URL)
  const openDiscord = () => openInBrowser(DISCORD_URL)
  const openReddit = () => openInBrowser(REDDIT_URL)
  const openShowcase = () => openManagedModal((close) => <ShowcaseModal closeModal={close} />)
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
            onClick={reportIssue}
            onOKButton={reportIssue}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 14px', width: 'auto' }}
          >
            {t('about_report_issue')}
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
        </Focusable>
      </Field>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_support_title')}</span>} />
      <Field focusable={true} bottomSeparator="none" description={<span style={labelStyle}>{t('about_support_description')}</span>} />
      {/* — Ko-fi card with scannable QR.
          Layout: QR on the left (scan from phone), tagline + button
          on the right ("scan or click"). Matches the WineCellar /
          SDH-PlayTime pattern of pairing the QR with the action so
          either input modality works without leaving the page. */}
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
