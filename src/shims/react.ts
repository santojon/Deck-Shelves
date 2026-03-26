const ReactGlobal =
  (globalThis as any).SP_REACT ||
  (globalThis as any).React ||
  (globalThis as any).window?.SP_REACT ||
  (globalThis as any).window?.React;

if (!ReactGlobal) {
  throw new Error("Deck Shelves: React global is not available in the Deck runtime.");
}

try {
  (globalThis as any).React = ReactGlobal;
  if ((globalThis as any).window) (globalThis as any).window.React = ReactGlobal;
} catch {}

export default ReactGlobal;
export const {
  Children,
  Component,
  Fragment,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} = ReactGlobal;
