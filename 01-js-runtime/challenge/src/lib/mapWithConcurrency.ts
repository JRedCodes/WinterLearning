/**
 * Like `Promise.all(items.map(fn))`, but never runs more than `limit` calls of `fn` at once.
 * Results come back in INPUT order, regardless of which call finished first.
 * If any call rejects, the returned promise rejects with that error (like Promise.all);
 * calls that haven't started yet are not started.
 *
 * Why: firing 10,000 requests at once at a downstream API is how you get rate-limited,
 * exhaust sockets, or take that API down. A small pool keeps throughput high and load bounded.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer, got ${limit}`);
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  // Each worker pulls the next index until the list is exhausted. JavaScript is single-threaded,
  // so `next++` can't be interleaved by another worker: no locks needed.
  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
