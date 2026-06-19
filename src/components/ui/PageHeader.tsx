import { Focusable } from "../../runtime/host/decky";
import { Navigation } from "@decky/ui";
import { ChevronLeftIcon, DocsIcon, GearIcon } from "../icons";

const ABOUT_ROUTE = "/deck-shelves/about";
const SETTINGS_ROUTE = "/deck-shelves/settings";

export interface PageHeaderProps {
  title: string;
  onBack: () => void;
  trailing?: React.ReactNode;
  /** Which route is active — used to dim the matching icon button. */
  active?: "about" | "settings";
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: 999,
  background: "var(--ds-surface, rgba(255,255,255,0.06))",
  cursor: "pointer",
  flexShrink: 0,
};

function goAbout() {
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  try { Navigation.Navigate(ABOUT_ROUTE); } catch {}
}
function goSettings() {
  try { (Navigation as any).CloseSideMenus?.(); } catch {}
  try { Navigation.Navigate(SETTINGS_ROUTE); } catch {}
}

export function PageHeader({ title, onBack, trailing, active }: PageHeaderProps) {
  return (
    <Focusable
      flow-children="row"
      className="ds-page-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "calc(env(safe-area-inset-top, 0px) + 64px) 16px 16px",
      }}
    >
      <Focusable
        onClick={onBack}
        onOKButton={onBack}
        onActivate={onBack}
        style={iconBtnStyle}
      >
        <ChevronLeftIcon />
      </Focusable>
      <h1
        style={{
          flex: 1,
          margin: 0,
          fontSize: "clamp(18px, 2.2vw, 22px)",
          fontWeight: 700,
          color: "var(--ds-text, #fff)",
          letterSpacing: 0.2,
        }}
      >{title}</h1>
      {trailing ? <div style={{ display: "inline-flex", alignItems: "center" }}>{trailing}</div> : null}
      <Focusable
        onClick={goAbout}
        onOKButton={goAbout}
        onActivate={goAbout}
        style={{ ...iconBtnStyle, opacity: active === "about" ? 0.4 : 1 }}
      >
        <DocsIcon size={20} />
      </Focusable>
      <Focusable
        onClick={goSettings}
        onOKButton={goSettings}
        onActivate={goSettings}
        style={{ ...iconBtnStyle, opacity: active === "settings" ? 0.4 : 1 }}
      >
        <GearIcon size={20} />
      </Focusable>
    </Focusable>
  );
}
