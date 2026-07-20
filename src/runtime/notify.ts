import { notify, type NotificationType } from '../components/notify';

/* Suppressible plugin toast. Delegates to the shared `notify` (branded logo +
   per-type icon) which enforces the master "disable notifications" toggle and
   the per-area disabled list. Fail-soft. */
export function notifyUser(title: string, body: string, type: NotificationType = 'info', area?: string): void {
  try { notify(type, { title, body, area }); } catch { /* toaster optional */ }
}
