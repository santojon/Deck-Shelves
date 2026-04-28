/**
 * Inline SVG icons used by tab strips (edit modals, About) and QAM
 * collapsible section headers. All icons share the same stroke-only
 * Feather-style aesthetic so the set reads as a coherent family on the
 * Steam Deck UI. Default size (14×14) fits both contexts; overrideable
 * via the `size` prop.
 */
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
// Filled style breaks the Feather aesthetic of the rest of the set, but
// the brand mark is a standard recognition cue and a stroke version
// would be unrecognizable.
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
