import { signToken } from "../../src/auth/tokens.js";
import { startInstance, type Instance, type InstanceOptions } from "../../src/instance.js";
import { REDIS_URL } from "./redis.js";

export const SECRET = "test-secret-123";

export function tokenFor(user: string): string {
  return signToken(user, SECRET);
}

/** Starts an instance on a random port. Errors are collected instead of printed. */
export async function start(prefix: string, overrides: Partial<InstanceOptions> = {}): Promise<Instance> {
  try {
    return await startInstance({
      port: 0,
      redisUrl: REDIS_URL,
      keyPrefix: prefix,
      tokenSecret: SECRET,
      heartbeatMs: 10_000,
      sseKeepAliveMs: 10_000,
      maxBufferedBytes: 1_048_576,
      historySize: 50,
      onError: () => {},
      ...overrides,
    });
  } catch (err) {
    throw new Error(`startInstance() failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}
