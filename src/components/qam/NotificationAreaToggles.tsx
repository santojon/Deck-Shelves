import { ToggleField } from '../../runtime/host/decky';

export const NOTIFICATION_AREAS = ['shelves', 'profiles', 'filters', 'triggers', 'cloudSync', 'update'];

export function NotificationAreaToggles({ settings, actions, t, disabled }: {
  settings: any;
  actions: any;
  t: (k: string) => string;
  disabled?: boolean;
}) {
  if (!settings || settings.notificationsDisabled !== true) return null;
  const off: string[] = settings.notificationsDisabledAreas ?? [];
  return (
    <div style={{ paddingLeft: 14 }}>
      {NOTIFICATION_AREAS.map((a) => (
        <ToggleField key={a} label={t(`notifications_area_${a}`)} checked={off.includes(a)} disabled={disabled} onChange={(v: boolean) => actions?.setNotificationAreaEnabled?.(a, !v)} />
      ))}
    </div>
  );
}
