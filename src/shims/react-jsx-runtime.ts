const JSXGlobal =
  (globalThis as any).SP_JSX ||
  (globalThis as any).window?.SP_JSX;

if (!JSXGlobal) {
  throw new Error("Deck Shelves: JSX runtime global is not available in the Deck runtime.");
}

export const Fragment = JSXGlobal.Fragment;
export const jsx = JSXGlobal.jsx;
export const jsxs = JSXGlobal.jsxs;
export const jsxDEV = JSXGlobal.jsxDEV;
export default JSXGlobal;
