/** Returns "now" as epoch milliseconds. Inject a fake one in tests. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
