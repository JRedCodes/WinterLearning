/**
 * TODO(1): TTL with jitter
 *
 * If 10,000 keys are cached at the same moment (a deploy, a cache flush, a
 * batch job warming the cache) with the same TTL, they all expire at the
 * same moment too, and the database gets 10,000 misses in one second.
 * Jitter spreads expiries out.
 *
 * Return a whole number of seconds, uniformly spread across
 *   [baseSeconds * (1 - jitterRatio), baseSeconds * (1 + jitterRatio)]
 * using the injected `random` (a function returning [0, 1) like Math.random):
 *   random() = 0    -> lowest value     (base 100, ratio 0.1 -> 90)
 *   random() = 0.5  -> baseSeconds      (-> 100)
 *   random() -> 1   -> highest value    (-> 110)
 * Round to the nearest integer with Math.round, and never return less than 1
 * (a TTL of 0 would be rejected by Redis).
 */
export function ttlWithJitter(
  baseSeconds: number,
  jitterRatio: number,
  random: () => number = Math.random,
): number {
  return baseSeconds;
}
