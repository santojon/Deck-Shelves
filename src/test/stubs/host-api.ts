export async function call<T = unknown>(_method: string, ..._args: unknown[]): Promise<T> {
  throw new Error('@host/api call() is stubbed in tests; mock the caller');
}
export const toaster = { toast: (_: unknown) => {} };
export async function openFilePicker(): Promise<null> { return null; }
export function definePlugin(factory: any) { return factory; }
