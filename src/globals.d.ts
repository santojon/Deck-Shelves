declare const __DECK_SHELVES_ENABLE_HOME_PATCH__: boolean;
declare const __DEV__: boolean;
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

interface Window {
  SP_REACT?: any;
  SP_REACTDOM?: any;
  SP_JSX?: any;
  DFL?: any;
  deckyFrontendLib?: any;
  SteamClient?: any;
}

declare module "*.png" { const src: string; export default src; }
