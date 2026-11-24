import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * A Lua script that Redis caches by its SHA1.
 *
 * `run()` first tries EVALSHA (send only the 40-char hash). If Redis answers
 * NOSCRIPT (it restarted, or SCRIPT FLUSH ran) we fall back to EVAL, which
 * sends the full source and caches it again. This is what ioredis's
 * `defineCommand` does internally; it's spelled out here so you can see it.
 *
 * Inside the script, keys arrive as KEYS[1..n] and arguments as ARGV[1..n].
 * Every ARGV value is a STRING in Lua: use tonumber() before doing math.
 */
export class LuaScript {
  readonly sha: string;

  constructor(
    readonly source: string,
    readonly numberOfKeys: number,
  ) {
    this.sha = createHash("sha1").update(source).digest("hex");
  }

  async run(redis: Redis, keys: string[], args: Array<string | number>): Promise<unknown> {
    if (keys.length !== this.numberOfKeys) {
      throw new Error(`script expects ${this.numberOfKeys} key(s), got ${keys.length}`);
    }
    try {
      return await redis.evalsha(this.sha, this.numberOfKeys, ...keys, ...args);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        return await redis.eval(this.source, this.numberOfKeys, ...keys, ...args);
      }
      throw err;
    }
  }
}

/**
 * Lua tables come back from Redis as arrays. Integers stay integers, but a Lua
 * float is TRUNCATED to an integer on the way out (3.9 → 3). Return whole
 * numbers from your scripts (math.floor / math.ceil) and parse them here.
 */
export function toIntegers(reply: unknown, expectedLength: number): number[] {
  if (!Array.isArray(reply) || reply.length !== expectedLength) {
    throw new Error(`unexpected script reply: ${JSON.stringify(reply)}`);
  }
  return reply.map((v) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`non-numeric script reply: ${JSON.stringify(reply)}`);
    return n;
  });
}
