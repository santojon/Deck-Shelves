import { logInfo } from '../runtime/logger';

const marks = new Map<string, number>();

export function mark(name: string): void {
  try {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    marks.set(name, now);
  } catch {}
}

export function measure(name: string, startName?: string): number | null {
  try {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const start = startName ? marks.get(startName) : undefined;
    const val = start ? Math.max(0, now - start) : null;
    if (val !== null) {
      logInfo('RUNTIME', `[perf] ${name}: ${val.toFixed(1)}ms`);
    }
    return val;
  } catch {
    return null;
  }
}

export async function withMeasure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  mark(name + ":start");
  try {
    return await fn();
  } finally {
    measure(name, name + ":start");
  }
}

export default { mark, measure, withMeasure };
