/**
 * The only file that reads process.env.
 *
 * Everything else receives configuration (or an already-built Redis client)
 * as a parameter, which is what makes the exercises easy to test.
 */
export interface Config {
  redisUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    // Database index 1 = module id 17 mod 16.
    redisUrl: env.REDIS_URL ?? "redis://localhost:6380/1",
  };
}
