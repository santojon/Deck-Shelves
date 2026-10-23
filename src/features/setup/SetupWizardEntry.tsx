import { DialogButton } from '../../runtime/host/decky'
import type { SettingsController } from '../settings/controller'
import { openManagedModal } from '../../components/qam/common/openManagedModal'
import { SetupWizardModal } from './SetupWizardModal'
import { WandIcon } from '../../components/icons'
import i18n from '../../i18n'

// The modal owns its controller; a caller that already has one may pass it.
export function openSetupWizard(controller?: SettingsController): void {
  openManagedModal((close) => <SetupWizardModal closeModal={close} controller={controller} />)
}

/* Discreet entry point: an icon button for the QAM title bar (next to the docs
   and settings icons), always reachable without taking a row of the list. The
   prominent call to action lives in the first-run banner, only while nothing is
   configured yet. */
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
