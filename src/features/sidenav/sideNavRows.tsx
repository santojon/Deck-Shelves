import { forwardRef, useRef } from "react";
import { Focusable, findModule } from "../../runtime/host/decky";

type PageListClasses = { item: string; scaled: string; title: string; icon: string };
let pageListClasses: PageListClasses | null | undefined;

// Steam's own Settings list classes: the client draws focus, hover and scale, and themes that restyle that list reach these rows.
function steamPageListClasses(): PageListClasses | null {
  if (pageListClasses !== undefined) return pageListClasses;
  pageListClasses = null;
  try {
    const m: any = findModule((mod: any) => typeof mod?.PagedSettingsDialog_PageListItem === "string" && typeof mod?.ScaledChildren === "string" && "EnterActive" in mod);
    if (m) pageListClasses = { item: m.PagedSettingsDialog_PageListItem, scaled: m.ScaledChildren, title: m.PageListItem_Title ?? "", icon: m.PageListItem_Icon ?? "" };
  } catch {}
  return pageListClasses;
}

// Without the client's classes, the same look inline: the accent fading from the left edge with a 2 px bar.
function fallbackRowStyle(focused: boolean): React.CSSProperties {
  return {
    padding: "10px calc(12px + 1.4vw)",
    color: focused ? "white" : "rgb(184, 188, 191)",
    borderLeft: `2px solid ${focused ? "rgb(26, 159, 255)" : "transparent"}`,
    background: focused ? "linear-gradient(90deg, rgba(26, 159, 255, 0.4) 0%, rgba(26, 159, 255, 0) 100%)" : "transparent",
  };
}

function buttonRowStyle(focused: boolean, disabled: boolean, steamClasses: boolean): React.CSSProperties {
  return {
    ...(steamClasses ? {} : fallbackRowStyle(focused)),
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}

function buttonContentStyle(focused: boolean, steamClasses: boolean): React.CSSProperties {
  const scale = !steamClasses && focused ? { transform: "scale(1.1)", transformOrigin: "12% 50%" } : {};
  return { display: "flex", alignItems: "center", gap: "0.5em", minWidth: 0, ...scale };
}

// The shelf on screen only reads brighter and heavier; the accent belongs to the focused row.
function buttonLabelStyle(active: boolean): React.CSSProperties {
  return {
    fontWeight: active ? 700 : undefined,
    color: active ? "white" : undefined,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export const ShelfButton = forwardRef<HTMLDivElement, {
  label: string;
  active: boolean;
  focused?: boolean;
  preferredFocus?: boolean;
  disabled?: boolean;
  icon?: unknown;
  onActivate: () => void;
  onFocusChange?: (focused: boolean) => void;
  hoverFocusTimeoutMs?: number;
}>(function ShelfButton({ label, active, focused, preferredFocus, disabled, icon, onActivate, onFocusChange, hoverFocusTimeoutMs }, ref) {
  const handle = disabled ? () => undefined : onActivate;
  const timerRef = useRef<number | null>(null);
  const steam = steamPageListClasses();
  const armTimer = () => {
    onFocusChange?.(true);
    if (!hoverFocusTimeoutMs || disabled) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; handle(); }, hoverFocusTimeoutMs);
  };
  const clearTimer = () => {
    onFocusChange?.(false);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  // Inline because the QAM stylesheet isn't mounted on the Home.
  return (
    <Focusable
      ref={ref}
      noFocusRing
      className={steam?.item}
      preferredFocus={preferredFocus}
      onClick={handle}
      onOKButton={handle}
      onActivate={handle}
      onGamepadFocus={armTimer}
      onGamepadBlur={clearTimer}
      style={buttonRowStyle(!!focused, !!disabled, !!steam)}
    >
      <div className={steam?.scaled} style={buttonContentStyle(!!focused, !!steam)}>
        {icon ? <span className={steam?.icon} style={{ display: "inline-flex" }}>{icon as React.ReactNode}</span> : null}
        <span className={steam?.title} style={buttonLabelStyle(active)}>{label}</span>
      </div>
    </Focusable>
  );
});

export function Header({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0.55, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 14px 4px" }}>
      {children}
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  return <div style={{ opacity: 0.55, padding: "8px 14px", fontStyle: "italic" }}>{text}</div>;
}
