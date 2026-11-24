/**
 * checkServices: "are my local Postgres and Redis up, and can this app reach them?"
 *
 * `npm run check` runs `main()`. It reads config from the environment, checks both services in
 * parallel, prints one line per service and exits non-zero if anything is down. That makes it
 * useful by hand, in a Makefile, and as a CI step before running integration tests.
 *
 * The design keeps the I/O at the edges so most of it can be unit-tested with fake clients:
 *
 *   loadConfig(env) ──► runChecks(config, factories) ──► formatReport / exitCodeFor
 *                               │
 *                     checkPostgres / checkRedis  (take a client interface, not a real driver)
 */
import type pg from "pg";
import type { Redis } from "ioredis";

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5433/wl_00";
export const DEFAULT_REDIS_URL = "redis://localhost:6380/0";
export const DEFAULT_TIMEOUT_MS = 2000;

export interface ServiceConfig {
  databaseUrl: string;
  redisUrl: string;
  /** How long each check may take before it counts as failed. */
  timeoutMs: number;
}

/** The environment is just a bag of optional strings. Taking it as a parameter keeps tests pure. */
export type Env = Record<string, string | undefined>;

/**
 * TODO(4): Read config from `env`, falling back to safe defaults.
 *
 * - DATABASE_URL → databaseUrl (default DEFAULT_DATABASE_URL)
 * - REDIS_URL → redisUrl (default DEFAULT_REDIS_URL)
 * - CHECK_TIMEOUT_MS → timeoutMs (default DEFAULT_TIMEOUT_MS). Must be a positive integer;
 *   anything else ("abc", "0", "-5", "1.5") throws an Error whose message mentions CHECK_TIMEOUT_MS.
 * - An empty string counts as "not set" (people write `DATABASE_URL=` in .env files all the time).
 */
export function loadConfig(env: Env = process.env): ServiceConfig {
  void env;
  throw new Error("Not implemented: loadConfig (TODO 4)");
}

// ---------------------------------------------------------------------------------------------
// Client interfaces: the smallest surface of `pg` and `ioredis` we actually use.
// Real drivers satisfy them; so do the tiny fakes in the tests.
// ---------------------------------------------------------------------------------------------

export interface PostgresClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

export interface RedisClient {
  connect(): Promise<unknown>;
  ping(): Promise<string>;
  /** Closes the connection immediately (no round trip). */
  disconnect(): void;
}

export type ServiceName = "postgres" | "redis";

export interface CheckResult {
  service: ServiceName;
  ok: boolean;
  /** Wall-clock time the check took, in whole milliseconds. */
  latencyMs: number;
  /** On success: a short description (e.g. "PostgreSQL 16.4", "PONG"). On failure: why. */
  detail: string;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

/**
 * TODO(5): Check Postgres using an already-constructed (not yet connected) client.
 *
 * - connect(), then run `SELECT version() AS version`.
 * - Success: ok=true, detail = the first two words of the version string
 *   ("PostgreSQL 16.4 on x86_64-pc-linux-musl, ..." → "PostgreSQL 16.4").
 * - Any error: ok=false, detail = the error's message. NEVER throw out of this function.
 * - If connect+query together take longer than `timeoutMs`: ok=false, detail contains "timed out".
 * - ALWAYS call client.end() exactly once, whether the check passed, failed or timed out.
 *   (If end() itself throws, ignore that.)
 * - latencyMs is measured around the whole check.
 */
export async function checkPostgres(client: PostgresClient, timeoutMs: number): Promise<CheckResult> {
  void client;
  void timeoutMs;
  throw new Error("Not implemented: checkPostgres (TODO 5)");
}

/**
 * TODO(6): Check Redis using an already-constructed (not yet connected) client.
 *
 * Same contract as checkPostgres, except:
 * - connect(), then ping(). The reply must be exactly "PONG"; anything else is a failure
 *   (detail should mention what came back).
 * - Success detail: "PONG".
 * - ALWAYS call client.disconnect() exactly once.
 */
export async function checkRedis(client: RedisClient, timeoutMs: number): Promise<CheckResult> {
  void client;
  void timeoutMs;
  throw new Error("Not implemented: checkRedis (TODO 6)");
}

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

export interface ClientFactories {
  createPostgres(url: string, timeoutMs: number): PostgresClient;
  createRedis(url: string, timeoutMs: number): RedisClient;
}

/**
 * TODO(7): Real client factories.
 *
 * createPostgres: a `pg.Client` for the URL, with `connectionTimeoutMillis` set to timeoutMs.
 * createRedis: an ioredis `Redis` for the URL that
 *   - does NOT connect in the constructor (lazyConnect: true; checkRedis calls connect()),
 *   - does NOT retry forever when the server is down (retryStrategy: () => null,
 *     maxRetriesPerRequest: 0, enableOfflineQueue: false),
 *   - gives up connecting after timeoutMs (connectTimeout).
 * Without those options ioredis keeps reconnecting in the background and your
 * process never exits. The integration test checks for exactly that.
 *
 * The `pg` and `ioredis` imports at the top are type-only; switch them to value imports here.
 */
export const realClients: ClientFactories = {
  createPostgres(_url: string, _timeoutMs: number): PostgresClient {
    throw new Error("Not implemented: realClients.createPostgres (TODO 7)");
  },
  createRedis(_url: string, _timeoutMs: number): RedisClient {
    throw new Error("Not implemented: realClients.createRedis (TODO 7)");
  },
};

// Keeps the type-only imports "used" until you implement TODO 7. Delete when you're done.
export type _DriverTypes = [pg.Client, Redis];

/**
 * TODO(8): Run both checks IN PARALLEL (not one after the other) and return
 * [postgresResult, redisResult] in that order.
 */
export async function runChecks(config: ServiceConfig, factories: ClientFactories = realClients): Promise<CheckResult[]> {
  void config;
  void factories;
  throw new Error("Not implemented: runChecks (TODO 8)");
}

/**
 * TODO(9): Human-readable report, one line per result, in input order:
 *
 *   [ OK ] postgres   12ms  PostgreSQL 16.4
 *   [FAIL] redis    2001ms  timed out after 2000ms
 *
 * Exact spacing is up to you, but each line must START with "[ OK ]" or "[FAIL]",
 * then contain the service name, the latency followed by "ms", and the detail.
 */
export function formatReport(results: CheckResult[]): string {
  void results;
  throw new Error("Not implemented: formatReport (TODO 9)");
}

/** TODO(9): 0 when every check passed (an empty list counts as passing), 1 otherwise. */
export function exitCodeFor(results: CheckResult[]): number {
  void results;
  throw new Error("Not implemented: exitCodeFor (TODO 9)");
}

/**
 * The whole program, minus process.exit. Already done for you: read it to see how the pieces fit.
 * Returns the exit code so tests can call it without killing the test runner.
 */
export async function main(
  env: Env = process.env,
  factories: ClientFactories = realClients,
  print: (line: string) => void = console.log,
): Promise<number> {
  let config: ServiceConfig;
  try {
    config = loadConfig(env);
  } catch (err) {
    print(`config error: ${(err as Error).message}`);
    return 2;
  }
  const results = await runChecks(config, factories);
  print(formatReport(results));
  return exitCodeFor(results);
}
