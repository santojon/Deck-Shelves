/* Single entry point for every Deck Shelves notification, so they all read the
   same in Steam's notification list: the branded logo on the left + a small,
   type-specific icon next to the title (mirrors how Decky's own toasts look).
   `buildNotification` is the pure payload builder (unit-tested); `notify` fires
   it through the toaster. */
import i18next from "i18next";
import { toaster } from "../shims/decky-api";
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

// One icon per notification kind. Mirrors the conventional glyphs (download for
// updates, sparkle for suggestions, check for success, copy for copy, …).
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
  // Optional notification area ("shelves" | "profiles" | "filters" |
  // "triggers" | "updates"); suppressed when that area is disabled.
  area?: string;
}

/* Suppressed when the master "disable notifications" toggle is on, or when the
   notification's area is in the per-area disabled list. Fail-open on any error. */
function isSuppressed(area?: string): boolean {
  try {
    const s = getCurrentSettings() as any;
    if (!s) return false;
    if (s.notificationsDisabled === true) return true;
    if (area && Array.isArray(s.notificationsDisabledAreas) && s.notificationsDisabledAreas.includes(area)) return true;
    return false;
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

// Pure: assemble the toast payload (branded logo + per-type icon). Kept free of
// side effects so the shape is unit-testable.
export function buildNotification(type: NotificationType, opts: NotifyOptions): NotificationPayload {
  const Icon = NOTIFICATION_ICONS[type];
  return {
    title: opts.title,
    body: opts.body,
    logo: <DeckShelvesLogo />,
    // Match the colour of the title text it sits next to (not a default tint).
    icon: <Icon size={18} style={{ color: "var(--ds-text, #fff)" }} />,
    duration: opts.durationMs,
    onClick: opts.onClick,
  };
}

// Fire a notification. Title defaults to the plugin name (the branded sender).
export function notify(type: NotificationType, opts: NotifyOptions): void {
  if (isSuppressed(opts.area)) return;
  const payload = buildNotification(type, { ...opts, title: opts.title ?? i18next.t("plugin_name") });
  try { (toaster as any)?.toast?.(payload); } catch { /* no toaster in this context */ }
}
