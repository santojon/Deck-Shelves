import React from 'react'
import { Field } from '../../runtime/host/decky'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--ds-text-dim, #b8bcbf)', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: 'var(--ds-text, #fff)' }

export function HowToPage() {
  const { t } = useTranslation()
  const steps = [
    t('about_howto_step1'), t('about_howto_step2'), t('about_howto_step3'),
    t('about_howto_step4'), t('about_howto_step5'),
  ]
  return (
    <DocSection>
      <Field focusable={true} bottomSeparator="none" label={<span style={headingStyle}>{t('about_howto_title')}</span>} />
      {steps.map((s, i) => (
        <Field key={i} focusable={true} bottomSeparator="none" label={<span style={labelStyle}><b>{i + 1}.</b> {s}</span>} />
      ))}
      <DocCallout variant="tip">{t('docs_howto_tip')}</DocCallout>
      <DocCallout variant="note">{t('docs_howto_note_smart')}</DocCallout>
      <Field focusable={true} bottomSeparator="none" label={<span style={labelStyle}>{t('docs_howto_note_footer')}</span>} />
    </DocSection>
  )
}
