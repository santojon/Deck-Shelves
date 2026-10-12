import { DialogButton } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { openManagedModal } from '../common/openManagedModal'
import { SetupWizardModal } from './SetupWizardModal'

export function openSetupWizard(controller: SettingsController): void {
  openManagedModal((close) => <SetupWizardModal closeModal={close} controller={controller} />)
}

// QAM entry point for the setup wizard — always reachable, first run or not.
export function SetupWizardEntry({ controller }: { controller: SettingsController }) {
  const { t } = controller
  const open = () => openSetupWizard(controller)
  return (
    <DialogButton style={{ width: '100%', minHeight: 36, fontSize: 13, margin: '4px 0' }} onClick={open} onOKButton={open} onOKActionDescription={t('setup_wizard_open' as any)}>
      {t('setup_wizard_open' as any)}
    </DialogButton>
  )
}
