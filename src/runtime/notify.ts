import { toaster } from './host/decky';
import { getCurrentSettings } from '../store/settingsStore';
import { buildNotification, type NotificationType } from '../components/notify';

/* Single entry point for the plugin's own toasts, so the "disable notifications"
   behaviour toggle can suppress ONLY Deck Shelves notifications (never Steam's).
   Delegates to `buildNotification` so these read the same as every other DS
   toast — the branded logo + a per-type icon. Fail-soft. */
export function notifyUser(title: string, body: string, type: NotificationType = 'info'): void {
  try {
    if ((getCurrentSettings() as any)?.notificationsDisabled === true) return;
    (toaster as any)?.toast?.(buildNotification(type, { body, title }));
  } catch { /* toaster optional */ }
}
