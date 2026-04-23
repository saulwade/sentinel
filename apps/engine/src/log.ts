/**
 * Tiny logger with DEBUG gating.
 *
 * By default: only info/warn/error print (clean startup + failures).
 * Set DEBUG=1 (or DEBUG=sentinel:*) to see per-event tool/policy traces.
 */

const DEBUG = process.env.DEBUG === '1' || (process.env.DEBUG ?? '').includes('sentinel');

export const debug = (...args: unknown[]): void => {
  if (DEBUG) console.log(...args);
};

export const info = (...args: unknown[]): void => {
  console.log(...args);
};

export const warn = (...args: unknown[]): void => {
  console.warn(...args);
};

export const error = (...args: unknown[]): void => {
  console.error(...args);
};
