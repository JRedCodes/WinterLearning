import { Redis } from "ioredis";
import pg from "pg";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./lib/logger.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const redis = new Redis(config.redisUrl);

const app = createApp({ config, pool, redis, logger });
app.listen(config.port, () => console.log(`notes api on http://localhost:${config.port}`));
