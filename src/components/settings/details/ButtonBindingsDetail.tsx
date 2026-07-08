import React, { useEffect, useRef, useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { subscribeControllerInput, Button as RawBtn } from "../../../runtime/controllerInput";
import { DEFAULT_BINDINGS, findCollisions, resolveBindings, validateCombo } from "../../../runtime/buttonBindings";
import type { ButtonBindings } from "../../../types";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { BanIcon, CheckIcon, RefreshIcon, TargetIcon, TrashIcon, GamepadIcon } from "../../icons";
import { BTN_COMPACT_STYLE, BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";

// Maps the raw controller event button id (from `controllerInput`) to
// the token name used by the bindings parser. Required because this
// settings route doesn't host the home-input bus.
const RAW_TO_TOKEN: Record<number, string> = {
  [RawBtn.X]: "X",
  [RawBtn.Y]: "Y",
  [RawBtn.L1]: "L1",
  [RawBtn.R1]: "R1",
  [RawBtn.L2]: "L2",
  [RawBtn.R2]: "R2",
  [RawBtn.L3]: "L3",
  [RawBtn.R3]: "R3",
  [RawBtn.L4]: "L4",
  [RawBtn.R4]: "R4",
  [RawBtn.L5]: "L5",
  [RawBtn.R5]: "R5",
  [RawBtn.VIEW]: "VIEW",
  [RawBtn.DPAD_UP]: "DPAD_UP",
  [RawBtn.DPAD_DOWN]: "DPAD_DOWN",
  [RawBtn.DPAD_LEFT]: "DPAD_LEFT",
  [RawBtn.DPAD_RIGHT]: "DPAD_RIGHT",
};

export interface ButtonBindingsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

type BindingKey = "cardHideRemove" | "cardHighlightToggle" | "cardQuickLaunch" | "navSearch" | "navSideNav" | "navSidecarOpen" | "navSidecarClose";

interface BindingRow {
  key: BindingKey;
  labelKey: string;
  nullable: boolean;
}

// Two parts: per-card shortcuts and home-navigation shortcuts.
const CARD_ROWS: BindingRow[] = [
  { key: "cardHideRemove",      labelKey: "binding_card_hide_remove",  nullable: true },
  { key: "cardHighlightToggle", labelKey: "binding_card_highlight",    nullable: true },
  { key: "cardQuickLaunch",     labelKey: "binding_card_quick_launch", nullable: true },
];
const NAV_ROWS: BindingRow[] = [
  { key: "navSearch",           labelKey: "binding_nav_search",        nullable: false },
  { key: "navSideNav",          labelKey: "binding_nav_sidenav",       nullable: false },
  { key: "navSidecarOpen",      labelKey: "binding_nav_sidecar_open",  nullable: false },
  { key: "navSidecarClose",     labelKey: "binding_nav_sidecar_close", nullable: false },
];

/* Quick gamepad-button glyph. Renders a small bordered chip with the
   token name. Steam doesn't expose a per-controller button icon API we
   can call from inside the plugin, so we use the literal token name
   (VIEW / MENU / X / Y / L1 / R1 / …) as a stable label. */
function ButtonGlyph({ token }: { token: string }) {
  const t = token.toUpperCase();
  const styleBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 22, height: 18, padding: "0 5px",
    borderRadius: 4, fontSize: 10, fontWeight: 700,
    background: "var(--gpSystemLighterStill, rgba(255,255,255,0.18))",
    color: "var(--ds-text, #fff)",
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

export function ButtonBindingsDetail({ controller, t }: ButtonBindingsDetailProps) {
  const settings = controller.settings;
  if (!settings) return null;
  const disabledList: string[] = ((settings as any).buttonBindingsDisabled ?? []) as string[];
  const rawBindings: ButtonBindings = (settings as any).buttonBindings ?? {};
  const bindings: Required<ButtonBindings> = resolveBindings(rawBindings, disabledList);
  const collisions = findCollisions(bindings);
  const collisionTokens = new Set(collisions.flat());
  // Only surface a navigation shortcut whose feature is actually enabled — a
  // Quick Search / Side Nav binding is meaningless when that feature is off.
  // The sidecar (the QAM panel) is always available, so its rows always show.
  const searchOn = (settings as any).contextSearchEnabled === true;
  const sidenavOn = (settings as any).sideNavEnabled === true;
  const navRows = NAV_ROWS.filter((r) =>
    r.key === "navSearch" ? searchOn : r.key === "navSideNav" ? sidenavOn : true,
  );
  // Reset only the bindings in one scope (card actions OR navigation) back to
  // their defaults — mirrors the per-row reset (default value + re-enable).
  const resetScope = (rows: BindingRow[]) => confirmAction({
    title: t("binding_reset_scope"),
    body: t("settings_confirm_irreversible"),
    okText: t("binding_reset_scope"),
    cancelText: t("cancel"),
    onConfirm: () => {
      for (const r of rows) {
        void (controller.actions as any).setButtonBinding?.(r.key, (DEFAULT_BINDINGS as any)[r.key]);
        if (disabledList.includes(r.key)) void (controller.actions as any).setBindingDisabled?.(r.key, false);
      }
    },
  });
  const resetButton = (rows: BindingRow[]) => (
    <DialogButton onClick={() => resetScope(rows)} onOKButton={() => resetScope(rows)} style={BTN_ICON_STYLE}>
      <RefreshIcon size={12} />
    </DialogButton>
  );

  const renderRows = (rows: BindingRow[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <BindingRowView
          key={row.key}
          row={row}
          rawValue={(rawBindings as any)[row.key] ?? null}
          effectiveValue={(bindings as any)[row.key] ?? null}
          disabled={disabledList.includes(row.key)}
          colliding={collisionTokens.has(row.key)}
          controller={controller}
          t={t}
        />
      ))}
    </div>
  );

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <CollapsibleSection
        id="bindings-card"
        title={t("settings_card_bindings_group")}
        count={CARD_ROWS.length}
        icon={<GamepadIcon size={14} />}
        initialOpen
        headerExtra={resetButton(CARD_ROWS)}
      >
        <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 10px" }}>{t("binding_help")}</div>
        {renderRows(CARD_ROWS)}
      </CollapsibleSection>
      <CollapsibleSection
        id="bindings-nav"
        title={t("settings_nav_bindings_title")}
        count={navRows.length}
        icon={<TargetIcon size={14} />}
        initialOpen
        headerExtra={resetButton(navRows)}
      >
        {renderRows(navRows)}
      </CollapsibleSection>
    </Focusable>
  );
}

function BindingStatus({ capturing, disabled, value, t }: {
  capturing: boolean;
  disabled: boolean;
  value: string | null;
  t: (key: string) => string;
}) {
  const wrapperStyle: React.CSSProperties = {
    fontSize: 12, padding: "3px 8px", borderRadius: 4,
    whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
    opacity: disabled ? 0.55 : 1,
  };
  let content: React.ReactNode;
  if (capturing) content = <span style={{ opacity: 0.85 }}>{t("binding_waiting")}</span>;
  else if (disabled) content = <span style={{ fontStyle: "italic" }}>{t("binding_disabled")}</span>;
  else if (value) content = renderCombo(value);
  else content = <span style={{ opacity: 0.55, fontStyle: "italic" }}>{t("binding_unset")}</span>;
  return <div style={wrapperStyle}>{content}</div>;
}

function BindingRowButtons({
  capturing, disabled, rawValue, nullable, startCapture, toggleDisabled, deleteBinding, reset, t,
}: {
  capturing: boolean;
  disabled: boolean;
  rawValue: string | null;
  nullable: boolean;
  startCapture: () => void;
  toggleDisabled: () => void;
  deleteBinding: () => void;
  reset: () => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <DialogButton
        onClick={startCapture}
        onOKButton={startCapture}
        disabled={capturing}
        style={BTN_ICON_STYLE}
        aria-label={capturing ? t("binding_cancel") : t("binding_capture")}
      >
        <TargetIcon size={16} />
      </DialogButton>
      <DialogButton
        onClick={toggleDisabled}
        onOKButton={toggleDisabled}
        disabled={capturing}
        style={BTN_ICON_STYLE}
        aria-label={disabled ? t("binding_enable") : t("binding_disable")}
      >
        {disabled ? <CheckIcon size={16} /> : <BanIcon size={16} />}
      </DialogButton>
      {nullable && (
        <DialogButton
          onClick={deleteBinding}
          onOKButton={deleteBinding}
          disabled={capturing || !rawValue}
          style={BTN_ICON_STYLE}
          aria-label={t("binding_delete")}
        >
          <TrashIcon size={16} />
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
    </>
  );
}

function BindingRowView({
  row, rawValue, effectiveValue, disabled, colliding, controller, t,
}: {
  row: BindingRow;
  rawValue: string | null;
  effectiveValue: string | null;
  disabled: boolean;
  colliding: boolean;
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}) {
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<"reserved" | "unknown" | "duplicate" | "empty" | null>(null);
  const buffer = useRef<{ tokens: string[]; firstAt: number }>({ tokens: [], firstAt: 0 });
  const timerRef = useRef<number | null>(null);
  const captureStartedAtRef = useRef<number>(0);
  // External state changes (Reset all / Delete from a different row) bring
  // a fresh `rawValue` in via props. Drop any locally-captured combo so the
  // chip mirrors the persisted value instead of the last capture attempt.
  useEffect(() => { setCaptured(null); setError(null); }, [rawValue, disabled]);

  const startCapture = () => {
    buffer.current = { tokens: [], firstAt: 0 };
    setCaptured(null);
    setError(null);
    captureStartedAtRef.current = Date.now();
    setCapturing(true);
  };
  const stopCapture = () => {
    setCapturing(false);
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (!capturing) return;
    const commitCombo = (combo: string) => {
      const v = validateCombo(combo);
      if (v.ok) { setCaptured(combo); persist(combo); }
      else setError(v.reason ?? "unknown");
      stopCapture();
    };
    const handle = (token: string | null) => {
      const now = Date.now();
      // 250ms grace — eats the A press that activated Capture itself.
      if (now - captureStartedAtRef.current < 250) return;
      if (!token) return;
      // Reserved-button rejection (A/B/Menu/Steam/Screenshot).
      const validation = validateCombo(token);
      if (!validation.ok && validation.reason === "reserved") {
        setError("reserved");
        stopCapture();
        return;
      }
      const buf = buffer.current;
      if (buf.tokens.length === 0) {
        buf.tokens = [token];
        buf.firstAt = now;
        timerRef.current = window.setTimeout(() => {
          if (buffer.current.tokens.length === 1) commitCombo(buffer.current.tokens[0]);
        }, 300);
      } else if (buf.tokens.length === 1 && (now - buf.firstAt) <= 300) {
        if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
        buf.tokens.push(token);
        commitCombo(buf.tokens.join("+"));
      }
    };
    const unsubRaw = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const token = RAW_TO_TOKEN[e.button] ?? null;
      // Surface the raw id so the user can see what an unmapped button emits.
      setLastRawId({ id: e.button, token });
      handle(token);
    });
    return () => { unsubRaw(); stopCapture(); };
  }, [capturing]);
  const [lastRawId, setLastRawId] = useState<{ id: number; token: string | null } | null>(null);
  useEffect(() => { if (!capturing) setLastRawId(null); }, [capturing]);

  const persist = (combo: string) => {
    void (controller.actions as any).setButtonBinding?.(row.key, combo);
  };
  const deleteBinding = () => {
    if (!row.nullable) return;
    void (controller.actions as any).setButtonBinding?.(row.key, null);
  };
  const toggleDisabled = () => {
    void (controller.actions as any).setBindingDisabled?.(row.key, !disabled);
  };
  const reset = () => {
    const def = (DEFAULT_BINDINGS as any)[row.key] as string;
    void (controller.actions as any).setButtonBinding?.(row.key, def);
    if (disabled) void (controller.actions as any).setBindingDisabled?.(row.key, false);
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
        <BindingStatus capturing={capturing} disabled={disabled} value={captured ?? effectiveValue} t={t} />
        <BindingRowButtons
          capturing={capturing}
          disabled={disabled}
          rawValue={rawValue}
          nullable={row.nullable}
          startCapture={startCapture}
          toggleDisabled={toggleDisabled}
          deleteBinding={deleteBinding}
          reset={reset}
          t={t}
        />
      </Focusable>
      {capturing && lastRawId && (
        <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "monospace" }}>
          raw id {lastRawId.id} {lastRawId.token ? `→ ${lastRawId.token}` : "→ (unmapped)"}
        </div>
      )}
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
