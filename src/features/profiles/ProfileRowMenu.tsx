import { Menu, MenuItem } from '../../runtime/host/decky'
import type { SettingsController } from '../settings/controller'
import type { ProfileRecord } from '../settings/controller/profiles'
import { joinDownloads } from '../../core/userPaths'
import { openManagedModal } from '../../components/qam/common/openManagedModal'
import { RowMenuButton } from '../../components/qam/common/RowMenuButton'
import { confirmAction } from '../../components/qam/modals/ConfirmActionModal'
import { SetProfileTriggerModal } from '../../components/qam/modals/SetProfileTriggerModal'
import { RenameProfileModal } from './RenameProfileModal'

type ProfileRowMenuProps = { controller: SettingsController; profile: ProfileRecord & { hidden?: boolean } }

// Same file name the settings page gives a single-profile export.
function exportPath(name: string): string {
  return joinDownloads(`profile-${name}.json`.replace(/\s+/g, '-').toLowerCase())
}

export function ProfileRowMenu({ controller, profile }: ProfileRowMenuProps) {
  const { t, actions, settings } = controller
  const { id, name } = profile
  const triggersOn = (settings as any)?.profileTriggersEnabled === true
  const setTrigger = () => openManagedModal((close) => (
    <SetProfileTriggerModal closeModal={close} controller={controller} profileId={id} currentTrigger={profile.trigger} />
  ))
  const rename = () => openManagedModal((close) => <RenameProfileModal closeModal={close} controller={controller} profileId={id} currentName={name} />)
  const remove = () => confirmAction({
    title: t('settings_profiles_delete_confirm_title'),
    body: t('settings_profiles_delete_confirm_message'),
    okText: t('settings_profiles_delete'),
    cancelText: t('settings_profiles_cancel'),
    onConfirm: () => void actions.deleteProfile(id),
  })
  return (
    <Menu label={name} cancelText={t('cancel')}>
      <MenuItem onSelected={() => void actions.applyProfile(id)}>{t('settings_profiles_apply')}</MenuItem>
      <MenuItem onSelected={() => void actions.updateProfileSnapshot(id)}>{t('settings_profiles_update')}</MenuItem>
      <MenuItem onSelected={() => void actions.setProfileLinkShelves(id, !profile.linkShelves)}>
        {t(profile.linkShelves ? 'profile_unlink_shelves_action' : 'profile_link_shelves_action')}
      </MenuItem>
      {triggersOn && <MenuItem onSelected={setTrigger}>{t('settings_profiles_set_trigger')}</MenuItem>}
      <MenuItem onSelected={rename}>{t('settings_profiles_rename')}</MenuItem>
      <MenuItem onSelected={() => void actions.duplicateProfile(id)}>{t('settings_profiles_duplicate')}</MenuItem>
      <MenuItem onSelected={() => void actions.toggleProfileHidden(id)}>{t(profile.hidden ? 'card_show' : 'card_hide')}</MenuItem>
      <MenuItem onSelected={() => void actions.exportProfiles(exportPath(name), id)}>{t('settings_profiles_export')}</MenuItem>
      <MenuItem onSelected={remove}>{t('settings_profiles_delete')}</MenuItem>
    </Menu>
  )
}

export function ProfileRowMenuButton(props: ProfileRowMenuProps) {
  return <RowMenuButton hint={props.controller.t('actions')} menu={() => <ProfileRowMenu {...props} />} />
}
