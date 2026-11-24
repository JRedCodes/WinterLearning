import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_REDIS_URL,
  DEFAULT_TIMEOUT_MS,
  checkPostgres,
  checkRedis,
  exitCodeFor,
  formatReport,
  loadConfig,
  main,
  runChecks,
  type CheckResult,
  type ClientFactories,
  type PostgresClient,
  type RedisClient,
} from "../src/checkServices.js";

// ---------------------------------------------------------------------------------------------
// Fakes: tiny objects that satisfy the client interfaces. No network involved.
// ---------------------------------------------------------------------------------------------

const PG_VERSION = "PostgreSQL 16.4 on x86_64-pc-linux-musl, compiled by gcc (Alpine 13.2.1) 13.2.1, 64-bit";
const never = () => new Promise<never>(() => {});

function fakePg(overrides: Partial<PostgresClient> = {}) {
  const client = {
    connect: vi.fn(async () => undefined),
    query: vi.fn(async (_sql: string) => ({ rows: [{ version: PG_VERSION }] })),
    end: vi.fn(async () => undefined),
    ...overrides,
  };
  return client;
}

function fakeRedis(overrides: Partial<RedisClient> = {}) {
  return {
    connect: vi.fn(async () => undefined),
    ping: vi.fn(async () => "PONG"),
    disconnect: vi.fn(() => undefined),
    ...overrides,
  };
}

describe("loadConfig (TODO 4)", () => {
  it("uses safe defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      databaseUrl: DEFAULT_DATABASE_URL,
      redisUrl: DEFAULT_REDIS_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  });

  it("the defaults point at the module's ports and database", () => {
    expect(DEFAULT_DATABASE_URL).toBe("postgres://postgres:postgres@localhost:5433/wl_00");
    expect(DEFAULT_REDIS_URL).toBe("redis://localhost:6380/0");
  });

  it("reads DATABASE_URL, REDIS_URL and CHECK_TIMEOUT_MS from the env it is given", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@db.internal:5432/app",
      REDIS_URL: "redis://cache.internal:6379/3",
      CHECK_TIMEOUT_MS: "750",
    });
    expect(config).toEqual({
      databaseUrl: "postgres://u:p@db.internal:5432/app",
      redisUrl: "redis://cache.internal:6379/3",
      timeoutMs: 750,
    });
  });

  it("treats empty strings as unset", () => {
    expect(loadConfig({ DATABASE_URL: "", REDIS_URL: "", CHECK_TIMEOUT_MS: "" })).toEqual(loadConfig({}));
  });

  it.each(["abc", "0", "-5", "1.5", "10ms"])("rejects CHECK_TIMEOUT_MS=%s with a clear error", (value) => {
    expect(() => loadConfig({ CHECK_TIMEOUT_MS: value })).toThrow(/CHECK_TIMEOUT_MS/);
  });

  it("does not read process.env when an env object is passed", () => {
    process.env.DATABASE_URL = "postgres://should-not-be-used";
    try {
      expect(loadConfig({}).databaseUrl).toBe(DEFAULT_DATABASE_URL);
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});

describe("checkPostgres (TODO 5)", () => {
  it("connects, queries the version and reports success", async () => {
    const client = fakePg();
    const result = await checkPostgres(client, 1000);
    expect(result).toMatchObject({ service: "postgres", ok: true, detail: "PostgreSQL 16.4" });
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(Number.isInteger(result.latencyMs), "latencyMs should be whole milliseconds").toBe(true);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/select\s+version\(\)/i));
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("reports a connection error as ok=false instead of throwing", async () => {
    const client = fakePg({ connect: vi.fn(async () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5433"))) });
    const result = await checkPostgres(client, 1000);
    expect(result).toMatchObject({ service: "postgres", ok: false, detail: "connect ECONNREFUSED 127.0.0.1:5433" });
    expect(client.end, "always close the client, even after a failure").toHaveBeenCalledTimes(1);
  });

  it("reports a query error as ok=false", async () => {
    const client = fakePg({ query: vi.fn(async () => Promise.reject(new Error('database "wl_00" does not exist'))) });
    const result = await checkPostgres(client, 1000);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/does not exist/);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("times out when the server never answers, and still closes the client", async () => {
    const client = fakePg({ connect: vi.fn(never) });
    const started = Date.now();
    const result = await checkPostgres(client, 50);
    expect(Date.now() - started, "should give up after ~timeoutMs").toBeLessThan(1000);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/timed out/i);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("ignores errors thrown while closing", async () => {
    const client = fakePg({ end: vi.fn(async () => Promise.reject(new Error("already closed"))) });
    const result = await checkPostgres(client, 1000);
    expect(result.ok).toBe(true);
  });
});

describe("checkRedis (TODO 6)", () => {
  it("connects, pings and reports PONG", async () => {
    const client = fakeRedis();
    const result = await checkRedis(client, 1000);
    expect(result).toMatchObject({ service: "redis", ok: true, detail: "PONG" });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.ping).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("treats an unexpected ping reply as a failure", async () => {
    const client = fakeRedis({ ping: vi.fn(async () => "LOADING") });
    const result = await checkRedis(client, 1000);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/LOADING/);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("reports connection errors as ok=false", async () => {
    const client = fakeRedis({ connect: vi.fn(async () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:6380"))) });
    const result = await checkRedis(client, 1000);
    expect(result).toMatchObject({ ok: false, detail: "connect ECONNREFUSED 127.0.0.1:6380" });
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("times out when ping never returns", async () => {
    const client = fakeRedis({ ping: vi.fn(never) });
    const result = await checkRedis(client, 50);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/timed out/i);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("runChecks (TODO 8)", () => {
  it("creates clients from the config and returns [postgres, redis]", async () => {
    const createPostgres = vi.fn(() => fakePg());
    const createRedis = vi.fn(() => fakeRedis());
    const results = await runChecks(
      { databaseUrl: "postgres://x/db", redisUrl: "redis://y/1", timeoutMs: 500 },
      { createPostgres, createRedis },
    );
    expect(createPostgres).toHaveBeenCalledWith("postgres://x/db", 500);
    expect(createRedis).toHaveBeenCalledWith("redis://y/1", 500);
    expect(results.map((r) => r.service)).toEqual(["postgres", "redis"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("runs both checks in parallel, not one after the other", async () => {
    // A barrier: each connect() only resolves once BOTH have been called. If the checks run
    // sequentially, the first connect waits forever and its check times out.
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const connect = vi.fn(async () => {
      arrived++;
      if (arrived === 2) release();
      await barrier;
    });
    const factories: ClientFactories = {
      createPostgres: () => fakePg({ connect }),
      createRedis: () => fakeRedis({ connect }),
    };
    const results = await runChecks({ databaseUrl: "a", redisUrl: "b", timeoutMs: 300 }, factories);
    expect(
      results.map((r) => `${r.service}:${r.ok}:${r.detail}`),
      "both checks should be in flight at the same time (Promise.all)",
    ).toEqual(["postgres:true:PostgreSQL 16.4", "redis:true:PONG"]);
  });
});

describe("formatReport and exitCodeFor (TODO 9)", () => {
  const ok: CheckResult = { service: "postgres", ok: true, latencyMs: 12, detail: "PostgreSQL 16.4" };
  const bad: CheckResult = { service: "redis", ok: false, latencyMs: 2001, detail: "timed out after 2000ms" };

  it("prints one line per result, in order, with status, name, latency and detail", () => {
    const lines = formatReport([ok, bad]).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[ OK \]/);
    expect(lines[0]).toMatch(/postgres/);
    expect(lines[0]).toMatch(/\b12ms\b/);
    expect(lines[0]).toMatch(/PostgreSQL 16\.4/);
    expect(lines[1]).toMatch(/^\[FAIL\]/);
    expect(lines[1]).toMatch(/redis/);
    expect(lines[1]).toMatch(/\b2001ms\b/);
    expect(lines[1]).toMatch(/timed out after 2000ms/);
  });

  it("exit code is 0 only when everything is ok", () => {
    expect(exitCodeFor([ok])).toBe(0);
    expect(exitCodeFor([ok, bad])).toBe(1);
    expect(exitCodeFor([bad])).toBe(1);
    expect(exitCodeFor([])).toBe(0);
  });
});

describe("main (wired end to end with fakes)", () => {
  it("prints the report and returns 1 when a service is down", async () => {
    const lines: string[] = [];
    const code = await main(
      { CHECK_TIMEOUT_MS: "200" },
      {
        createPostgres: () => fakePg(),
        createRedis: () => fakeRedis({ connect: vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))) }),
      },
      (line) => lines.push(line),
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/\[ OK \].*postgres/);
    expect(lines.join("\n")).toMatch(/\[FAIL\].*redis.*ECONNREFUSED/);
  });

  it("returns 2 for invalid config without touching the network", async () => {
    const createPostgres = vi.fn(() => fakePg());
    const lines: string[] = [];
    const code = await main({ CHECK_TIMEOUT_MS: "soon" }, { createPostgres, createRedis: () => fakeRedis() }, (l) =>
      lines.push(l),
    );
    expect(code).toBe(2);
    expect(createPostgres).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/CHECK_TIMEOUT_MS/);
  });
});
