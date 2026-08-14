import { ToggleField } from '../../runtime/host/decky';

export const NOTIFICATION_AREAS = ['shelves', 'profiles', 'filters', 'triggers'];

/* Per-area exceptions to the master "disable notifications" toggle, shown
   only while it's ON (off, everything already flows — nothing to except).
   Areas come checked ("don't notify this flow") by default; unchecking one
   lets that flow through despite the master. */
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
