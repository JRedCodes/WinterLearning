/** Anything that can tell the time. Injected so tests can freeze it. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
