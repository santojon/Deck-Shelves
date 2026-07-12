import { toaster } from './host/decky';
import { getCurrentSettings } from '../store/settingsStore';

/* Single entry point for the plugin's own toasts, so the "disable notifications"
   behaviour toggle can suppress ONLY Deck Shelves notifications (never Steam's).
   Fail-soft — a missing toaster or settings never throws. */
export function notifyUser(title: string, body: string): void {
  try {
    if ((getCurrentSettings() as any)?.notificationsDisabled === true) return;
    (toaster as any)?.toast?.({ title, body });
  } catch { /* toaster optional */ }
}
