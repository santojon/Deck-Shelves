// See src/shims/react.ts — same sole-host fallback.
function getShelvesHost(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

const JSXGlobal =
  (globalThis as any).SP_JSX ||
  (globalThis as any).window?.SP_JSX ||
  getShelvesHost()?.jsx;

if (!JSXGlobal) {
  throw new Error("Deck Shelves: JSX runtime global is not available in the Deck runtime.");
}

export const Fragment = JSXGlobal.Fragment;
export const jsx = JSXGlobal.jsx;
export const jsxs = JSXGlobal.jsxs;
export const jsxDEV = JSXGlobal.jsxDEV;
export default JSXGlobal;
