declare const __DECK_SHELVES_ENABLE_HOME_PATCH__: boolean;
declare const __DEV__: boolean;

interface Window {
  SP_REACT?: any;
  SP_REACTDOM?: any;
  SP_JSX?: any;
  DFL?: any;
  deckyFrontendLib?: any;
  SteamClient?: any;
}

declare module "*.png" { const src: string; export default src; }
