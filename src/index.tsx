import React, { useEffect } from "react";
import { PanelSection, PanelSectionRow, staticClasses } from "@decky/ui";
import { definePlugin, routerHook, toaster } from "@decky/api";
import { FaLayerGroup } from "react-icons/fa";

import { useDeckShelvesSettings } from "./state/settings";
import { SettingsView } from "./components/SettingsView";
import { DeckShelvesHost } from "./components/DeckShelvesHost";
import { loadI18n, t } from "./i18n";

function ensureDeckShelvesCss() {
  const id = "deck-shelves-style";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    /* Keep QAM content within bounds */
    .deck-shelves-qam, .deck-shelves-qam * { box-sizing: border-box; max-width: 100%; }
    .deck-shelves-qam { width: 100%; max-width: 100%; overflow-x: hidden; }
    .deck-shelves-qam input, .deck-shelves-qam textarea, .deck-shelves-qam select { max-width: 100%; width: 100%; }
    .deck-shelves-qam .PanelSectionRow { width: 100%; }
    .deck-shelves-qam .Field { width: 100%; }
  `;
  document.head.appendChild(style);
}

function QuickAccessContent() {
  const { settings, setSettings, loaded } = useDeckShelvesSettings();

  if (!loaded) {
    return (
      <PanelSection title="Deck Shelves">
        <PanelSectionRow>Loading…</PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <div className="deck-shelves-qam">
      <SettingsView settings={settings} setSettings={setSettings} />
    </div>
  );
}

/**
 * Safe Home injection:
 * - Never patch React element internals like `.type`
 * - Only rewrite route props and clone children
 * - Fallback to append if layout changes
 */
function mountHomeInjection() {
  const injected = <DeckShelvesHost key="deck-shelves-inject" />;

  const patchRoute = (route: string) =>
    routerHook.addPatch(route, (props: any) => {
      try {
        const inject = (node: any): [any, boolean] => {
          if (!node) return [node, false];

          if (Array.isArray(node)) {
            const already = node.some((c: any) => c?.key === "deck-shelves-inject");
            if (already) return [node, true];

            if (node.length > 0) {
              // Insert after the first shelf/row
              const next = [node[0], injected, ...node.slice(1)];
              return [next, true];
            }
            return [node, false];
          }

          if (React.isValidElement(node)) {
            const ch = (node as any).props?.children;
            const [nextCh, did] = inject(ch);
            if (!did) return [node, false];
            return [React.cloneElement(node as any, undefined, nextCh), true];
          }

          return [node, false];
        };

        const [nextChildren, did] = inject(props?.children);
        if (did) {
          return { ...props, children: nextChildren };
        }

        // Fallback: append at end so user always sees shelves
        return {
          ...props,
          children: (
            <>
              {props?.children}
              {injected}
            </>
          ),
        };
      } catch (e) {
        console.error("Deck Shelves: home injection failed", e);
        return props;
      }
    });

  const patches = [
    // Library Home (stable)
    patchRoute("/library/home"),
    patchRoute("/library/home/"),
    // Route fallbacks for SteamUI variants
    patchRoute("/library"),
    patchRoute("/library/"),
  ];

  return () => {
    for (const p of patches) {
      try {
        (p as any)?.remove?.();
      } catch {
        // ignore
      }
    }
  };
}

export default definePlugin(() => {
  ensureDeckShelvesCss();
  void loadI18n();

  const unmount = mountHomeInjection();

  toaster.toast({
    title: "Deck Shelves",
    body: t("toast.enabled", "Enabled."),
  });

  return {
    name: "Deck Shelves",
    titleView: <div className={staticClasses.Title}>Deck Shelves</div>,
    content: <QuickAccessContent />,
    icon: <FaLayerGroup />,
    onDismount() {
      unmount();
    },
  };
});
