import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import pg from "pg";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../../src/app.js";
import { loadConfig, type Config } from "../../src/config.js";
import { buildContainer, type Container } from "../../src/container.js";
import { migrate } from "../../src/db/migrate.js";
import { createPool } from "../../src/db/pool.js";
import { FakeClock, FakeEmailSender, InMemoryEventPublisher } from "./fakes.js";

export type App = ReturnType<typeof createApp>;

/** Every test starts at this instant (by the injected clock). */
export const START = new Date("2030-01-01T10:00:00.000Z");
export const SHOW_TIME = "2030-06-01T19:00:00.000Z";
export const PASSWORD = "correct horse battery";
export const ORGANIZER = "organizer@example.com";
export const ORGANIZER_2 = "organizer2@example.com";

export interface TestContext {
  config: Config;
  pool: pg.Pool;
  redis: Redis;
  clock: FakeClock;
  publisher: InMemoryEventPublisher;
  emailSender: FakeEmailSender;
  container: Container;
  app: App;
}

/** Settings every test context uses unless a test file overrides them. */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  PASSWORD_SCRYPT_N: "1024", // cheap hashing keeps 100 sign-ups fast
  ORGANIZER_EMAILS: `${ORGANIZER},${ORGANIZER_2}`,
  NOTIFY_BACKOFF_MS: "20",
  NOTIFY_MAX_ATTEMPTS: "4",
  // Generous defaults so only the rate-limit tests ever hit a limit.
  LOGIN_RATE_LIMIT: "1000",
  HOLD_RATE_LIMIT: "1000",
};

export async function connectTestRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    redis.disconnect();
    throw new Error(`Redis not reachable at ${url}: run \`make up\` first (${(err as Error).message})`);
  }
  return redis;
}

export async function flushPrefix(redis: Redis, prefix: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}

/** Infrastructure + fakes, without building the container (useful for a second app instance). */
export async function createInfra(env: Record<string, string> = {}) {
  const config = loadConfig({ ...process.env, ...TEST_ENV, ...env });
  const pool = createPool({ connectionString: config.databaseUrl, max: config.dbPoolMax });
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    await pool.end();
    throw new Error(`Postgres not reachable at ${config.databaseUrl}: run \`make up\` first (${(err as Error).message})`);
  }
  const redis = await connectTestRedis(config.redisUrl);
  return {
    config,
    pool,
    redis,
    clock: new FakeClock(START),
    publisher: new InMemoryEventPublisher(),
    emailSender: new FakeEmailSender(),
  };
}

export async function createTestContext(env: Record<string, string> = {}): Promise<TestContext> {
  const infra = await createInfra(env);
  let container: Container;
  try {
    container = buildContainer(infra);
  } catch (err) {
    await Promise.allSettled([infra.pool.end(), infra.redis.quit()]);
    throw err;
  }
  return { ...infra, container, app: createApp(container) };
}

/** Fresh schema, no wl:36: keys, clock back at START, fakes emptied. Call in beforeEach. */
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(ctx.pool);
  await flushPrefix(ctx.redis, ctx.config.redisKeyPrefix);
  ctx.clock.set(START);
  ctx.publisher.reset();
  ctx.emailSender.reset();
}

export async function closeTestContext(ctx: TestContext | undefined): Promise<void> {
  if (!ctx) return;
  await ctx.container.close().catch(() => {});
  await flushPrefix(ctx.redis, ctx.config.redisKeyPrefix).catch(() => {});
  await Promise.allSettled([ctx.pool.end(), ctx.redis.quit()]);
}

// ---------------------------------------------------------------------------
// API helpers. They assert on the happy path so a failure points at the cause.
// ---------------------------------------------------------------------------

export interface Session {
  user: { id: string; email: string; name: string; role: string };
  token: string;
  auth: { Authorization: string };
}

export async function register(app: App, email: string, name = "Test User") {
  const res = await request(app).post("/auth/register").send({ email, password: PASSWORD, name });
  expect(res.status, `register ${email} failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as Session["user"];
}

export async function login(app: App, email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
  expect(res.status, `login ${email} failed: ${JSON.stringify(res.body)}`).toBe(200);
  expect(typeof res.body.data?.token, "login must return data.token").toBe("string");
  return res.body.data.token as string;
}

export async function signUp(app: App, email: string, name = "Test User"): Promise<Session> {
  const user = await register(app, email, name);
  const token = await login(app, email);
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

export interface EventInput {
  name?: string;
  venue?: string;
  startsAt?: string;
  priceCents?: number;
  rows?: number;
  seatsPerRow?: number;
}

export interface EventBody {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  priceCents: number;
  totalSeats: number;
  organizerId: string;
}

/** Creates a 2 x 5 event (seats A1..A5, B1..B5) at 25.00 per seat unless overridden. */
export async function createEvent(app: App, organizer: Session, input: EventInput = {}): Promise<EventBody> {
  const body = {
    name: "Winter Synth Night",
    venue: "The Warehouse",
    startsAt: SHOW_TIME,
    priceCents: 2500,
    rows: 2,
    seatsPerRow: 5,
    ...input,
  };
  const res = await request(app).post("/events").set(organizer.auth).send(body);
  expect(res.status, `create event failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as EventBody;
}

export function holdSeats(app: App, who: Session, eventId: string, seats: string[]) {
  return request(app).post(`/events/${eventId}/holds`).set(who.auth).send({ seats });
}

export function book(app: App, who: Session, holdId: string, idempotencyKey: string = randomUUID()) {
  return request(app).post("/bookings").set(who.auth).set("Idempotency-Key", idempotencyKey).send({ holdId });
}

/** Seat label -> status, from the public seat map. */
export async function seatStatuses(app: App, eventId: string): Promise<Record<string, string>> {
  const res = await request(app).get(`/events/${eventId}/seats`);
  expect(res.status, `seat map failed: ${JSON.stringify(res.body)}`).toBe(200);
  const seats = res.body.data.seats as { id: string; status: string }[];
  return Object.fromEntries(seats.map((s) => [s.id, s.status]));
}

/** Holds seats and asserts it worked; returns the hold body. */
export async function holdOk(app: App, who: Session, eventId: string, seats: string[]) {
  const res = await holdSeats(app, who, eventId, seats);
  expect(res.status, `hold ${seats.join(",")} failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; eventId: string; seats: string[]; expiresAt: string; status: string };
}

export function countStatuses(responses: { status: number }[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}
