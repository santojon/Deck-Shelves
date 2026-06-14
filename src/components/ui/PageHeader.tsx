import { Focusable } from "../../runtime/host/decky";
import { ChevronLeftIcon } from "../icons";

export interface PageHeaderProps {
  title: string;
  onBack: () => void;
  trailing?: React.ReactNode;
}

export function PageHeader({ title, onBack, trailing }: PageHeaderProps) {
  return (
    <div
      className="ds-page-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "calc(env(safe-area-inset-top, 0px) + 64px) 16px 16px",
      }}
    >
      <Focusable
        noFocusRing
        onClick={onBack}
        onOKButton={onBack}
        onActivate={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          cursor: "pointer",
        }}
      >
        <ChevronLeftIcon />
      </Focusable>
      <h1
        style={{
          flex: 1,
          margin: 0,
          fontSize: "clamp(18px, 2.2vw, 22px)",
          fontWeight: 700,
          color: "white",
          letterSpacing: 0.2,
        }}
      >{title}</h1>
      {trailing ? (
        <div style={{ display: "inline-flex", alignItems: "center" }}>{trailing}</div>
      ) : null}
    </div>
  );
}
