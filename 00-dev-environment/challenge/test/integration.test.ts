import { describe, expect, it } from "vitest";
import { loadConfig, realClients, runChecks } from "../src/checkServices.js";

/**
 * These talk to the REAL services from your docker-compose.yml (or whatever DATABASE_URL /
 * REDIS_URL point at). Run `make up` first. CI starts the same services before running tests.
 */
describe("integration: real Postgres and Redis (TODO 7)", () => {
  it("both services are reachable with the real clients", async () => {
    const results = await runChecks(loadConfig(process.env), realClients);
    const [pgResult, redisResult] = results;

    expect(
      pgResult?.ok,
      `Postgres check failed: "${pgResult?.detail}". Is it running on 5433? Try \`make up\` then \`make test\`.`,
    ).toBe(true);
    expect(pgResult?.detail).toMatch(/^PostgreSQL 16/);

    expect(
      redisResult?.ok,
      `Redis check failed: "${redisResult?.detail}". Is it running on 6380? Try \`make up\` then \`make test\`.`,
    ).toBe(true);
    expect(redisResult?.detail).toBe("PONG");
  });

  it("fails fast (no endless reconnect loop) when nothing is listening", async () => {
    // Port 1 is never a database. A correctly configured client gives up quickly;
    // ioredis with default options would retry forever and this test would time out.
    const started = Date.now();
    const results = await runChecks(
      { databaseUrl: "postgres://postgres:postgres@127.0.0.1:1/wl_00", redisUrl: "redis://127.0.0.1:1/0", timeoutMs: 1000 },
      realClients,
    );
    expect(results.map((r) => r.ok)).toEqual([false, false]);
    expect(Date.now() - started, "checks should give up within about timeoutMs").toBeLessThan(3000);
  });
});
