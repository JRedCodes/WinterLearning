/**
 * Time is a dependency. Anything that depends on "now" (hold expiry, rate-limit
 * windows, "upcoming" events, event timestamps) asks a Clock instead of calling
 * `new Date()` or Postgres `now()`, so tests can move time forward instantly.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
