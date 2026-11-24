/** Anything that can tell the time. Inject it so tests can control time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
