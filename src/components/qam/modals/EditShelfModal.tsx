import React from 'react'
import { DialogButton, PanelSection, PanelSectionRow, Field, TextField, ToggleField, Focusable } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'

export function EditShelfModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t } = controller
  // Minimal placeholder modal to satisfy import until full implementation is restored
  return (
    <div style={{ padding: 16, width: 520 }}>
      <PanelSection title={t('edit_shelf') || 'Edit Shelf'}>
        <PanelSectionRow>
          <Field label={t('title') || 'Title'}>
            <TextField value={shelf.title ?? ''} onChange={() => {}} />
          </Field>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t('hide_status_line') || 'Hide status line'} checked={!!shelf.hideStatusLine} onChange={() => {}} />
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable>
            <DialogButton onClick={() => closeModal?.()} onOKButton={() => closeModal?.()} style={{ width: '100%' }}>{t('close') || 'Close'}</DialogButton>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </div>
  )
}
