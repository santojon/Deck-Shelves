import React, { useEffect, useRef, useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { subscribeHomeButton } from "../../../runtime/homeInputBus";
import { BTN, DEFAULT_BINDINGS, findCollisions, resolveBindings, validateCombo } from "../../../runtime/buttonBindings";
import type { ButtonBindings } from "../../../types";
import { SettingsSection } from "../../ui/SettingsSection";
import { BanIcon, RefreshIcon, TargetIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";

export interface ButtonBindingsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

type BindingKey = "cardHideRemove" | "cardHighlightToggle" | "cardQuickLaunch" | "navSearch" | "navSideNav";

interface BindingRow {
  key: BindingKey;
  labelKey: string;
  nullable: boolean;
}

const ROWS: BindingRow[] = [
  { key: "cardHideRemove",      labelKey: "binding_card_hide_remove", nullable: true },
  { key: "cardHighlightToggle", labelKey: "binding_card_highlight",   nullable: true },
  { key: "cardQuickLaunch",     labelKey: "binding_card_quick_launch", nullable: true },
  { key: "navSearch",           labelKey: "binding_nav_search",       nullable: false },
  { key: "navSideNav",          labelKey: "binding_nav_sidenav",      nullable: false },
];

// Quick gamepad-button glyph. Renders a small bordered chip with the
// token name. Steam doesn't expose a per-controller button icon API we
// can call from inside the plugin, so we use the literal token name
// (VIEW / MENU / X / Y / L1 / R1 / …) as a stable label.
function ButtonGlyph({ token }: { token: string }) {
  const t = token.toUpperCase();
  const styleBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 22, height: 18, padding: "0 5px",
    borderRadius: 4, fontSize: 10, fontWeight: 700,
    background: "var(--gpSystemLighterStill, rgba(255,255,255,0.18))",
    color: "white",
    fontFamily: "monospace", letterSpacing: 0.2,
  };
  return <span style={styleBase}>{t}</span>;
}

function renderCombo(raw: string | null | undefined): React.ReactNode {
  if (!raw) return null;
  const tokens = String(raw).split("+").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 2 && tokens[0] === tokens[1]) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ButtonGlyph token={tokens[0]} /><span style={{ fontSize: 11, opacity: 0.7 }}>×2</span></span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {tokens.map((tok, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <span style={{ fontSize: 10, opacity: 0.55 }}>+</span> : null}
          <ButtonGlyph token={tok} />
        </React.Fragment>
      ))}
    </span>
  );
}

const BTN_TO_TOKEN: Record<number, string> = {
  [BTN.SECONDARY]:  "X",
  [BTN.OPTIONS]:    "Y",
  [BTN.L1]:         "L1",
  [BTN.R1]:         "R1",
  [BTN.L2]:         "L2",
  [BTN.R2]:         "R2",
  [BTN.VIEW]:       "VIEW",
  [BTN.DPAD_UP]:    "DPAD_UP",
  [BTN.DPAD_DOWN]:  "DPAD_DOWN",
  [BTN.DPAD_LEFT]:  "DPAD_LEFT",
  [BTN.DPAD_RIGHT]: "DPAD_RIGHT",
  [BTN.LSTICK]:     "LSTICK",
  [BTN.RSTICK]:     "RSTICK",
};

export function ButtonBindingsDetail({ controller, t }: ButtonBindingsDetailProps) {
  const settings = controller.settings;
  if (!settings) return null;
  const bindings: Required<ButtonBindings> = resolveBindings((settings as any).buttonBindings);
  const collisions = findCollisions(bindings);
  const collisionTokens = new Set(collisions.flat());

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <SettingsSection description={t("binding_help")}>
        {ROWS.map((row) => (
          <BindingRowView
            key={row.key}
            row={row}
            current={bindings[row.key]}
            colliding={collisionTokens.has(row.key)}
            controller={controller}
            t={t}
          />
        ))}
        <Focusable flow-children="row" style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <DialogButton
            onClick={() => void (controller.actions as any).resetButtonBindings?.()}
            onOKButton={() => void (controller.actions as any).resetButtonBindings?.()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", height: 32 }}
          >
            <RefreshIcon size={14} />
            <span>{t("binding_reset_all")}</span>
          </DialogButton>
        </Focusable>
      </SettingsSection>
    </Focusable>
  );
}

function BindingRowView({
  row, current, colliding, controller, t,
}: {
  row: BindingRow;
  current: string | null;
  colliding: boolean;
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}) {
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<"reserved" | "unknown" | "duplicate" | "empty" | null>(null);
  const buffer = useRef<{ tokens: string[]; firstAt: number }>({ tokens: [], firstAt: 0 });
  const timerRef = useRef<number | null>(null);

  const startCapture = () => {
    buffer.current = { tokens: [], firstAt: 0 };
    setCaptured(null);
    setError(null);
    setCapturing(true);
  };
  const stopCapture = () => {
    setCapturing(false);
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (!capturing) return;
    const unsub = subscribeHomeButton((e) => {
      const token = BTN_TO_TOKEN[e.button];
      const now = Date.now();
      if (!token) {
        const validation = validateCombo(String(e.button));
        if (!validation.ok && validation.reason === "reserved") { setError("reserved"); stopCapture(); return; }
        return;
      }
      const buf = buffer.current;
      if (buf.tokens.length === 0) {
        buf.tokens = [token];
        buf.firstAt = now;
        timerRef.current = window.setTimeout(() => {
          if (buffer.current.tokens.length === 1) {
            const combo = buffer.current.tokens[0];
            const v = validateCombo(combo);
            if (v.ok) { setCaptured(combo); persist(combo); }
            else setError(v.reason ?? "unknown");
            stopCapture();
          }
        }, 300);
      } else if (buf.tokens.length === 1 && (now - buf.firstAt) <= 300) {
        if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
        buf.tokens.push(token);
        const combo = buf.tokens.join("+");
        const v = validateCombo(combo);
        if (v.ok) { setCaptured(combo); persist(combo); }
        else setError(v.reason ?? "unknown");
        stopCapture();
      }
    });
    return () => { unsub(); stopCapture(); };
  }, [capturing]);

  const persist = (combo: string) => {
    void (controller.actions as any).setButtonBinding?.(row.key, combo);
  };
  const clearBinding = () => {
    if (!row.nullable) return;
    void (controller.actions as any).setButtonBinding?.(row.key, null);
  };
  const reset = () => {
    const def = (DEFAULT_BINDINGS as any)[row.key] as string;
    void (controller.actions as any).setButtonBinding?.(row.key, def);
  };

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 8,
      background: colliding ? "var(--ds-danger-soft, rgba(255, 80, 80, 0.10))" : "var(--ds-surface, rgba(255, 255, 255, 0.04))",
      border: colliding ? "1px solid rgba(255, 80, 80, 0.45)" : "1px solid var(--ds-border, rgba(255, 255, 255, 0.06))",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0 }}>{t(row.labelKey)}</div>
        <div style={{
          fontSize: 12, padding: "3px 8px", borderRadius: 4,
          whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          {capturing ? <span style={{ opacity: 0.85 }}>{t("binding_waiting")}</span>
            : (captured ?? current)
              ? renderCombo(captured ?? current)
              : <span style={{ opacity: 0.55, fontStyle: "italic" }}>{t("binding_disabled")}</span>}
        </div>
        <DialogButton
          onClick={startCapture}
          onOKButton={startCapture}
          disabled={capturing}
          style={BTN_ICON_STYLE}
          aria-label={capturing ? t("binding_cancel") : t("binding_capture")}
        >
          <TargetIcon size={16} />
        </DialogButton>
        {row.nullable && (
          <DialogButton
            onClick={clearBinding}
            onOKButton={clearBinding}
            disabled={capturing || !current}
            style={BTN_ICON_STYLE}
            aria-label={t("binding_disable")}
          >
            <BanIcon size={16} />
          </DialogButton>
        )}
        <DialogButton
          onClick={reset}
          onOKButton={reset}
          disabled={capturing}
          style={BTN_ICON_STYLE}
          aria-label={t("binding_reset")}
        >
          <RefreshIcon size={16} />
        </DialogButton>
      </Focusable>
      {error && (
        <div style={{ fontSize: 12, color: "rgb(255, 120, 120)" }}>
          {t(`binding_error_${error}`)}
        </div>
      )}
      {colliding && (
        <div style={{ fontSize: 12, color: "rgb(255, 180, 120)" }}>
          {t("binding_collision")}
        </div>
      )}
    </div>
  );
}
