// Stub for @decky/api used in tests. Avoids loading the real module which
// transitively imports @decky/manifest (a build-time virtual). The exports
// below cover only what the codebase imports at module-load time; any test
// that needs real behavior should mock the call site directly.
export async function call<T = unknown>(_method: string, ..._args: unknown[]): Promise<T> {
  throw new Error('@decky/api call() is stubbed in tests; mock the caller');
}
export const toaster = { toast: (_: unknown) => {} };
export async function openFilePicker(): Promise<null> { return null; }
export function definePlugin(factory: any) { return factory; }
