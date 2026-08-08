/**
 * A recording stand-in for setTimeout, used by the main-process suites.
 *
 * startgg.ts's request throttle sleeps between calls. Real sleeps would make the
 * pagination-cap tests take actual seconds, and the durations themselves are
 * worth asserting, so the suites replace setTimeout with something that records
 * what was asked for.
 *
 * IMPORTANT: do not use this in a suite that exercises wrappedFetch's 5xx retry.
 * In 'sync' mode the callback fires immediately, which makes a working 1000ms
 * backoff indistinguishable from no backoff at all, and pollutes `sleeps` with a
 * duration the throttle never requested. That suite uses jest.useFakeTimers()
 * instead - and the two cannot be combined, because this spy would shadow the
 * fake timer installation.
 */

export type SyntheticTimers = {
  /** Every delay asked for, in order. */
  sleeps: number[];
  /** Fire everything recorded in 'deferred' mode, in scheduling order. */
  runPending: () => void;
  restore: () => void;
};

export function installSyntheticTimers({
  mode,
}: { mode?: 'sync' | 'deferred' } = {}): SyntheticTimers {
  const sleeps: number[] = [];
  const pending: Array<() => void> = [];
  const deferred = mode === 'deferred';

  const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: () => void,
    ms: number,
  ) => {
    sleeps.push(ms);
    if (deferred) {
      pending.push(callback);
    } else {
      callback();
    }
    return 0;
  }) as unknown as typeof setTimeout);

  return {
    sleeps,
    runPending: () => {
      while (pending.length > 0) {
        pending.shift()!();
      }
    },
    restore: () => spy.mockRestore(),
  };
}
