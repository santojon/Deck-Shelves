import React from "react";

const firstRun = __DEV__ && typeof __QA_FIRST_RUN__ !== "undefined" && __QA_FIRST_RUN__;
const qamError = __DEV__ && typeof __QA_QAM_ERROR__ !== "undefined" && __QA_QAM_ERROR__;
const shelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;

if (firstRun || qamError || shelfError) {
  // eslint-disable-next-line no-console
  console.warn("[Deck Shelves QA] active flags:", { firstRun, qamError, shelfError });
}

export function wrapQAMSettings<P extends { controller: any }>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!firstRun && !qamError) return Component;
  return function QAMSettingsQA(props: P) {
    if (qamError) throw new Error("QA: forced QAM render error");
    const c: any = props.controller;
    const patched = {
      ...c,
      shelves: [],
      settings: c?.settings ? { ...c.settings, enabled: false } : c?.settings,
    };
    return <Component {...props} controller={patched} />;
  };
}

export function wrapHomeShelves<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!shelfError) return Component;
  return function HomeShelvesQA(_props: P) {
    throw new Error("QA: forced shelf render error");
  };
}
