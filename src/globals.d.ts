declare const __DECK_SHELVES_ENABLE_HOME_PATCH__: boolean;
declare const __DEV__: boolean;
// Vite ships an ESM bundle, so `require` is undefined at runtime — but a
// handful of dev-only QA harness loaders use `try { require(...) } catch {}`
// as a guarded import that's silently no-op'd in production. The ambient
// declaration keeps `tsc --noEmit` happy without pulling in `@types/node`.
declare const require: any;
declare const __QA_FIRST_RUN__: boolean;
declare const __QA_QAM_ERROR__: boolean;
declare const __QA_SHELF_ERROR__: boolean;
declare const __QA_ALL_SHELVES_HIDE_RECENTS__: boolean;
declare const __QA_ALL_SHELVES_SHOW_RECENTS__: boolean;
declare const __QA_ALL_SHELVES_HIDE_HOME_TABS__: boolean;
declare const __QA_ALL_SHELVES_SHOW_HOME_TABS__: boolean;
declare const __QA_FORCE_TABMASTER__: string;
declare const __QA_FORCE_UNIFIDECK__: string;
declare const __QA_FORCE_NONSTEAMBADGES__: string;
declare const __QA_SMART_SHELVES_FIXTURE__: boolean;
declare const __QA_SAVED_FILTERS_FIXTURE__: boolean;
declare const __QA_FORCE_HIDDEN_SHELF__: boolean;
declare const __QA_SMART_SURPRISE_ME__: boolean;
declare const __QA_FORCE_HOME_CRASH__: boolean;
declare const __QA_FORCE_REPLACE_FAILED__: boolean;
declare const __QA_UPDATE_AVAILABLE__: boolean;
declare const __QA_UPDATE_DISMISSED__: boolean;
declare const __QA_UPDATE_OFFLINE__: boolean;
declare const __QA_COLLECTION_EMPTY__: boolean;
declare const __QA_COLLECTION_INVERTED__: boolean;

interface Window {
  SP_REACT?: any;
  SP_REACTDOM?: any;
  SP_JSX?: any;
  DFL?: any;
  deckyFrontendLib?: any;
  SteamClient?: any;
}

declare module "*.png" { const src: string; export default src; }
