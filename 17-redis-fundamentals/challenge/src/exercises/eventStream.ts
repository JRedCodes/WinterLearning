import type { Redis } from "ioredis";
import { key } from "../lib/keys.js";

/**
 * Exercise 8 · Append-only event log (STREAM)
 *
 * Key: wl:17:stream:<name>
 *
 * A stream is an append-only log of entries. Each entry has a unique,
 * increasing id ("<ms>-<seq>", e.g. "1718000000000-0") and a flat map of
 * string fields. Readers remember the last id they processed and ask for
 * everything after it, which is how they resume after a restart.
 */
export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

/**
 * Append an entry with an auto-generated id ("*") and return that id.
 * Keep the stream bounded to roughly the last `maxLen` entries
 * (approximate trimming with "~" is fine and cheaper).
 */
export async function appendEvent(
  redis: Redis,
  stream: string,
  fields: Record<string, string>,
  maxLen = 1000,
): Promise<string> {
  throw new Error("Not implemented: appendEvent");
}

/**
 * Up to `count` entries with an id strictly GREATER than `afterId`, oldest
 * first. afterId "0" means "from the beginning". A missing stream returns [].
 * Redis returns fields as a flat array [k1, v1, k2, v2]: convert it to an object.
 */
export async function readEvents(
  redis: Redis,
  stream: string,
  afterId = "0",
  count = 100,
): Promise<StreamEntry[]> {
  throw new Error("Not implemented: readEvents");
}

void key;
