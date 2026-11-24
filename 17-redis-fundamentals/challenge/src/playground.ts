/**
 * A scratchpad for trying your exercises against a real Redis.
 * Run it with `make dev` (reloads on save). Edit freely: tests don't use it.
 */
import { loadConfig } from "./config.js";
import { createRedis } from "./lib/redis.js";
import { getViews, recordView } from "./exercises/pageViews.js";
import { addScore, topN } from "./exercises/leaderboard.js";

const redis = createRedis(loadConfig().redisUrl);

try {
  await recordView(redis, "home");
  console.log("home views:", await getViews(redis, "home"));

  await addScore(redis, "weekly", "ada", 120);
  await addScore(redis, "weekly", "linus", 90);
  console.log("top 3:", await topN(redis, "weekly", 3));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  redis.disconnect();
}
