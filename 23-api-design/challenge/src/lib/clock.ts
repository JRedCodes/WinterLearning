/** Injected everywhere time matters, so tests are deterministic. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
