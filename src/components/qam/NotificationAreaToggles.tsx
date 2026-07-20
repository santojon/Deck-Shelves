import { ToggleField } from '../../runtime/host/decky';

const AREAS = ['shelves', 'profiles', 'filters', 'triggers'];

/* Per-area notification opt-outs, shown under the master "disable notifications"
   toggle only while notifications are still on. No subtexts; every area is on by
   default (absent from `notificationsDisabledAreas`). Extracted from
   DeckQAMSettings to keep that file under the line cap. */
export function NotificationAreaToggles({ settings, actions, t, disabled }: {
  settings: any;
  actions: any;
  t: (k: string) => string;
  disabled?: boolean;
}) {
  if (!settings || settings.notificationsDisabled === true) return null;
  const off: string[] = settings.notificationsDisabledAreas ?? [];
  return (
    <div style={{ paddingLeft: 14 }}>
      {AREAS.map((a) => (
        <ToggleField key={a} label={t(`notifications_area_${a}`)} checked={!off.includes(a)} disabled={disabled} onChange={(v: boolean) => actions?.setNotificationAreaEnabled?.(a, v)} />
      ))}
    </div>
  );
}
