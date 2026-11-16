import { DialogButton } from '../../runtime/host/decky'
import type { SettingsController } from '../settings/controller'
import { openManagedModal } from '../../components/qam/common/openManagedModal'
import { SetupWizardModal } from './SetupWizardModal'
import { WandIcon } from '../../components/icons'
import i18n from '../../i18n'

export function openSetupWizard(controller?: SettingsController): void {
  openManagedModal((close) => <SetupWizardModal closeModal={close} controller={controller} />)
}

export function SetupWizardEntry({ controller }: { controller?: SettingsController }) {
  const label = controller?.t ? controller.t('setup_wizard_open' as any) : i18n.t('setup_wizard_open')
  const open = () => openSetupWizard(controller)
  return (
    <DialogButton
      style={{ height: 28, width: 28, minWidth: 0, padding: 0, borderRadius: 4, flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      onClick={open}
      onOKButton={open}
      onOKActionDescription={label}
    >
      <WandIcon size={16} />
    </DialogButton>
  )
}
