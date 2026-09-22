/**
 * Clock abstraction so time-dependent logic (token expiry, etc.) is
 * deterministic and testable. Inject a fixed clock in tests.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test helper: a clock fixed at (and advanceable from) a given instant. */
export function fixedClock(start: Date): Clock & { advance(ms: number): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}
