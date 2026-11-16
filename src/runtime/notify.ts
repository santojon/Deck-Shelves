import { notify, type NotificationType } from '../components/notify';

export function notifyUser(title: string, body: string, type: NotificationType = 'info', area?: string): void {
  try { notify(type, { title, body, area }); } catch {}
}
