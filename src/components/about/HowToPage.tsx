import React from 'react'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'

const listStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px', marginBottom: 8, paddingLeft: 10 }
const stepNum: React.CSSProperties = { display: 'inline-block', width: 20, fontWeight: 700, color: '#dcdedf' }

export function HowToPage() {
  const { t } = useTranslation()
  return (
    <DocSection>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{t('about_howto_title')}</div>
      {[
        t('about_howto_step1'),
        t('about_howto_step2'),
        t('about_howto_step3'),
        t('about_howto_step4'),
        t('about_howto_step5'),
      ].map((s, i) => (
        <div key={i} style={listStyle}>
          <span style={stepNum}>{i + 1}.</span>{s}
        </div>
      ))}
    </DocSection>
  )
}
