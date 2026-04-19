import React from 'react'
import { Field } from '@decky/ui'
import { useTranslation } from 'react-i18next'
import { DocSection } from './DocSection'
import { DocCallout } from './DocCallout'

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#b8bcbf', lineHeight: '19px' }
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#fff' }

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
      <DocCallout variant="tip">
        Start with a template — it sets up the source and sort for you. You can rename and adjust everything after creation.
      </DocCallout>
      <DocCallout variant="note">
        Smart Shelves appear and disappear automatically based on your library. Enable them from the Smart Shelves section in the QAM.
      </DocCallout>
    </DocSection>
  )
}
