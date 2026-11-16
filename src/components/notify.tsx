import i18next from "i18next";
import { toaster } from "../shims/host-api";
import { getCurrentSettings } from "../store/settingsStore";
import {
  DeckShelvesLogo,
  DownloadIcon,
  UploadIcon,
  SparkleIcon,
  CheckIcon,
  BanIcon,
  InfoCircleIcon,
  RefreshIcon,
  CopyIcon,
  PersonIcon,
  TrashIcon,
} from "./icons";

export type NotificationType =
  | "update" | "suggestion" | "success" | "error"
  | "warning" | "info" | "export" | "import" | "reset" | "copy" | "profile" | "delete";

type Glyph = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;

export const NOTIFICATION_ICONS: Record<NotificationType, Glyph> = {
  update: DownloadIcon,
  suggestion: SparkleIcon,
  success: CheckIcon,
  error: BanIcon,
  warning: InfoCircleIcon,
  info: InfoCircleIcon,
  export: UploadIcon,
  import: DownloadIcon,
  reset: RefreshIcon,
  copy: CopyIcon,
  profile: PersonIcon,
  delete: TrashIcon,
};

export interface NotifyOptions {
  body: string;
  title?: string;
  onClick?: () => void;
  durationMs?: number;
  area?: string;
}

// The disabled areas only apply while the master toggle is on.
function isSuppressed(area?: string): boolean {
  try {
    const s = getCurrentSettings() as any;
    if (!s) return false;
    if (s.notificationsDisabled !== true) return false;
    if (!area) return true;
    return Array.isArray(s.notificationsDisabledAreas) && s.notificationsDisabledAreas.includes(area);
  } catch { return false; }
}

export interface NotificationPayload {
  title?: string;
  body: string;
  logo: React.ReactNode;
  icon: React.ReactNode;
  duration?: number;
  onClick?: () => void;
}

export function buildNotification(type: NotificationType, opts: NotifyOptions): NotificationPayload {
  const Icon = NOTIFICATION_ICONS[type];
  return {
    title: opts.title,
    body: opts.body,
    logo: <DeckShelvesLogo />,
    icon: <Icon size={18} style={{ color: "var(--ds-text, #fff)" }} />,
    duration: opts.durationMs,
    onClick: opts.onClick,
  };
}

export function notify(type: NotificationType, opts: NotifyOptions): void {
  if (isSuppressed(opts.area)) return;
  const payload = buildNotification(type, { ...opts, title: opts.title ?? i18next.t("plugin_name") });
  try { (toaster as any)?.toast?.(payload); } catch {}
}
