import type { Cache } from "../cache/cache.js";
import type { CacheMetrics } from "../cache/cacheMetrics.js";
import { ttlWithJitter } from "../cache/ttl.js";
import type { Product, ProductPatch } from "../domain/product.js";
import type { ProductRepository } from "./productRepository.js";

/**
 * Cache key for a product. The "v1" is a schema version: if the shape of
 * the cached JSON ever changes, bump it to v2 and old entries are simply
 * never read again (they expire on their own), so old and new app versions
 * can run side by side during a deploy without reading each other's data.
 */
export const productCacheKey = (id: string) => `wl:18:product:v1:${id}`;

export interface CachedProductRepositoryOptions {
  /** Base TTL for found products. */
  ttlSeconds: number;
  /** +/- spread applied to ttlSeconds, e.g. 0.1 = +/-10%. */
  jitterRatio: number;
  /** TTL for "not found" answers. Keep it short. */
  negativeTtlSeconds: number;
  /** Injectable randomness for deterministic tests. */
  random?: () => number;
}

/**
 * A DECORATOR: it implements ProductRepository by wrapping another
 * ProductRepository (`inner`, the slow Postgres one) and adding caching.
 * The service never knows it's there.
 *
 * Right now it's a pass-through: every call goes to the database.
 * Work through the TODOs (see CHALLENGE.md for the full contract):
 *
 * TODO(2): cache-aside in findById.
 *   - Look up productCacheKey(id) in the cache.
 *   - Hit:  parse the JSON, record a hit, return it. Don't touch `inner`.
 *   - Miss: record a miss, load from `inner`, store JSON in the cache with
 *           ttlWithJitter(ttlSeconds, jitterRatio, random), return it.
 *
 * TODO(3): negative caching.
 *   - When `inner` returns null, cache that answer too, for
 *     negativeTtlSeconds (no jitter needed). A later lookup must return
 *     null from the cache without calling `inner`, and counts as a hit.
 *   - You choose how to represent "not found" in the cache, as long as it
 *     can't be confused with a real product.
 *
 * TODO(4): invalidation on write.
 *   - update() writes to `inner` first, then DELETES the cache entry
 *     (don't overwrite it; SOLUTION.md discusses why).
 *
 * TODO(5): request coalescing (stampede protection).
 *   - If 100 requests miss on the same id at the same time, only ONE may
 *     call inner.findById. The other 99 wait for that same promise.
 *   - Keep a Map<id, Promise<Product | null>> of loads in flight. A miss
 *     that finds an entry joins it (and records coalesced). Remove the
 *     entry when the load settles, success OR failure, so a failed load
 *     isn't remembered forever.
 *   - Every caller still records its own hit/miss (see CacheMetrics).
 *
 * TODO(6): fail open.
 *   - The cache is an optimization, not a dependency. If cache.get/set/del
 *     throws (Redis down), record an error and carry on: a failed get is
 *     treated as a miss, a failed set is ignored, and a failed del must not
 *     fail the update (the database write already happened).
 */
export class CachedProductRepository implements ProductRepository {
  constructor(
    private readonly inner: ProductRepository,
    private readonly cache: Cache,
    private readonly metrics: CacheMetrics,
    private readonly options: CachedProductRepositoryOptions,
  ) {}

  async findById(id: string): Promise<Product | null> {
    return this.inner.findById(id);
  }

  async update(id: string, patch: ProductPatch): Promise<Product | null> {
    return this.inner.update(id, patch);
  }
}

// Imported for you; you'll need it in TODO(2).
void ttlWithJitter;
