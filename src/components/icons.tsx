type IconProps = { size?: number; style?: React.CSSProperties };

const baseProps = (size: number, style?: React.CSSProperties): React.SVGProps<SVGSVGElement> => ({
  xmlns: "http://www.w3.org/2000/svg",
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  style: { flexShrink: 0, verticalAlign: "middle", ...style },
});

export function FunnelIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function EyeIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 4.22-5.53" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-3.31 4.34" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function SortIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <polyline points="7 10 7 4 7 16" />
      <polyline points="3 8 7 4 11 8" />
      <polyline points="17 14 17 20 17 8" />
      <polyline points="13 16 17 20 21 16" />
    </svg>
  );
}

export function SparkleIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </svg>
  );
}

export function BookmarkIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function InfoCircleIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function GearIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function PlusCircleIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function SlidersIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2.4" fill="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2.4" fill="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function SideNavIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="5.4" y1="8" x2="6.6" y2="8" />
      <line x1="5.4" y1="12" x2="6.6" y2="12" />
      <line x1="5.4" y1="16" x2="6.6" y2="16" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="13" width="4" height="7" rx="1.5" />
      <rect x="17" y="13" width="4" height="7" rx="1.5" />
    </svg>
  );
}

export function BluetoothIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M6.5 8 18 16 12 20.5V3.5L18 8 6.5 16" />
    </svg>
  );
}

export function StackIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function WandIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)}>
      <path d="M5 3v4" />
      <path d="M3 5h4" />
      <path d="M19 17v4" />
      <path d="M17 19h4" />
      <path d="M14 6l4 4-10 10-4-4z" />
    </svg>
  );
}

// Generic utility icons — accept optional color overrides because they
// were previously hardcoded to specific accents (green check, red x).
// Defaults preserve those colors so existing call sites keep their look.
type ColoredIconProps = IconProps & { color?: string };

export function CheckIcon({ size = 14, style, color = "#4caf50" }: ColoredIconProps) {
  return (
    <svg
      {...baseProps(size, { marginRight: 3, ...style })}
      stroke={color}
      strokeWidth={2.5}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function XIcon({ size = 14, style, color = "#f44336" }: ColoredIconProps) {
  return (
    <svg
      {...baseProps(size, { marginRight: 3, ...style })}
      stroke={color}
      strokeWidth={2.5}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Animated chevron used by collapsible accordions: rotates between -90deg
// (closed → pointing right) and 0deg (open → pointing down).
export function ChevronIcon({ open, size = 12, style }: IconProps & { open: boolean }) {
  return (
    <svg
      {...baseProps(size, {
        transition: "transform 0.2s ease-in-out",
        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
        ...style,
      })}
      strokeWidth={2.5}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function TrashIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2.2}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M10 10v6" />
      <path d="M14 10v6" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  );
}

// Steam logo — used to mark Steam-native entries in import lists.
export function OnlineIcon({ size = 12, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// Left-pointing chevron — back / dismiss control on dedicated page
// routes (PageHeader, detail panels). Bigger default size since the
// header button it sits inside is much larger than a row indicator.
export function ChevronLeftIcon({ size = 22, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2.5}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function PersonIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function PuzzleIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2}>
      <path d="M19.5 14.5c-1 0-2 .5-2 1.5s1 1.5 2 1.5c.5 0 1-.5 1-1V9c0-.5-.5-1-1-1h-4.5c0-1-.5-2-1.5-2s-1.5 1-1.5 2H7c-.5 0-1 .5-1 1v3.5c-1 0-2 .5-2 1.5s1 1.5 2 1.5V19c0 .5.5 1 1 1h4.5c0 1 .5 2 1.5 2s1.5-1 1.5-2H19c.5 0 1-.5 1-1v-4.5z" />
    </svg>
  );
}

export function SaveIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export function ToolsIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size, style)} strokeWidth={2}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

// Filled style breaks the Feather aesthetic of the rest of the set, but
// the brand mark is a standard recognition cue and a stroke version
// would be unrecognizable.
export function DocsIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
    </svg>
  );
}

export function CopyIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M4 15V5a1 1 0 0 1 1-1h10" />
    </svg>
  );
}

export function PencilIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M14.06 5.94l3.99 4M3 21h4l11-11-4-4L3 17v4z" />
    </svg>
  );
}

export function DownloadIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M12 3v12m0 0l-5-5m5 5l5-5" />
      <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export function UploadIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M12 21V9m0 0l-5 5m5-5l5 5" />
      <path d="M4 7V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export function PlayIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function TargetIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function ClockIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function SearchIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function CalendarIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function GaugeIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M4 19a8 8 0 1 1 16 0" />
      <path d="M12 15l4-4" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function BatteryIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <rect x="2" y="8" width="16" height="9" rx="2" />
      <path d="M21 11v3" />
      <path d="M5 11v3" />
    </svg>
  );
}

export function MonitorIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function BanIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  );
}

export function RefreshIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

// Restore/revert: a single counter-clockwise arrow (distinct from RefreshIcon's
// two-arrow sync). Used to roll settings back to a snapshot.
export function RestoreIcon({ size = 14, style }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-9L1 10" />
    </svg>
  );
}

export function GamepadIcon({ size = 14, style }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
    >
      <line x1="6" y1="11" x2="10" y2="11" />
      <line x1="8" y1="9" x2="8" y2="13" />
      <line x1="15" y1="12" x2="15.01" y2="12" />
      <line x1="18" y1="10" x2="18.01" y2="10" />
      <path d="M17.32 5H6.68A5 5 0 0 0 2 10.36V14a3 3 0 0 0 5.6 1.5L8.4 14h7.2l.8 1.5A3 3 0 0 0 22 14v-3.64A5 5 0 0 0 17.32 5z" />
    </svg>
  );
}

export function SteamIcon({ size = 14, style }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
    >
      <path d="M11.98 2C6.48 2 2.04 6.45 2.01 11.94L7.16 14.04a2.7 2.7 0 0 1 2.95-.6l2.3-3.34v-.05a3.61 3.61 0 0 1 7.22 0 3.61 3.61 0 0 1-3.62 3.6h-.09l-3.28 2.35c0 .1.02.2.02.3a2.72 2.72 0 0 1-5.39.5L3.5 15.27A9.97 9.97 0 0 0 22 12c0-5.52-4.48-10-10.02-10ZM8.3 17.14l-1.18-.49a2.05 2.05 0 0 0 3.71-.37 2.04 2.04 0 0 0-1.14-2.66 2.02 2.02 0 0 0-1.56.02l1.22.5a1.5 1.5 0 0 1-1.15 2.78l-.42-.17.52 1.39Zm7.69-7.67a2.4 2.4 0 0 0-2.41-2.4 2.4 2.4 0 0 0-2.41 2.4 2.4 2.4 0 0 0 2.41 2.4 2.4 2.4 0 0 0 2.41-2.4Zm-4.22 0a1.81 1.81 0 1 1 3.63-.01 1.81 1.81 0 0 1-3.63.01Z" />
    </svg>
  );
}

// Branded logo for notifications — the same shelf glyph as the QAM plugin icon
// (no box), just rendered larger so it fills the toast/notification logo slot.
export function DeckShelvesLogo({ size = 40 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="0.75" y1="20.75" x2="23.25" y2="20.75" strokeWidth="1.6" />
      <rect x="1" y="6.5" width="4.5" height="14.25" rx="0.5" strokeWidth="1.5" />
      <line x1="1" y1="9.5" x2="5.5" y2="9.5" strokeWidth="1.1" />
      <rect x="6.5" y="3.5" width="4" height="17.25" rx="0.5" strokeWidth="1.5" />
      <line x1="6.5" y1="6.75" x2="10.5" y2="6.75" strokeWidth="1.1" />
      <rect x="11.5" y="8.5" width="3.5" height="12.25" rx="0.5" strokeWidth="1.5" />
      <line x1="11.5" y1="11.25" x2="15" y2="11.25" strokeWidth="1.1" />
      <rect x="16" y="5" width="6.5" height="15.75" rx="0.5" strokeWidth="1.5" />
      <line x1="16" y1="8.5" x2="22.5" y2="8.5" strokeWidth="1.1" />
    </svg>
  );
}
