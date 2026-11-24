import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UnrecoverableError } from "bullmq";
import type { Redis } from "ioredis";
import { InMemoryUserRepository } from "../src/repositories/userRepository.js";
import { RedisIdempotencyStore } from "../src/jobs/idempotency.js";
import { createWelcomeEmailProcessor } from "../src/jobs/processors/welcomeEmail.js";
import { createAvatarThumbnailProcessor } from "../src/jobs/processors/avatarThumbnail.js";
import { FakeEmailSender, FakeThumbnailer } from "./helpers/fakes.js";
import { deletePrefix, testRedis } from "./helpers/redis.js";

// Processors are plain async functions: we can unit test them without any queue.

describe("welcome email processor (TODO 5)", () => {
  let redis: Redis;
  let prefix: string;
  let users: InMemoryUserRepository;

  beforeAll(async () => {
    redis = await testRedis();
  });
  afterAll(() => redis.disconnect());
  beforeEach(() => {
    prefix = `wl:20:test:${randomUUID().slice(0, 8)}:idem:`;
    users = new InMemoryUserRepository();
  });
  afterEach(() => deletePrefix(redis, prefix));

  const make = (email: FakeEmailSender) =>
    createWelcomeEmailProcessor({ users, email, idempotency: new RedisIdempotencyStore(redis, prefix) });

  it("sends a welcome email to the user", async () => {
    const user = await users.create({ email: "ada@example.com", name: "Ada" });
    const email = new FakeEmailSender();
    expect(await make(email)({ data: { userId: user.id } })).toEqual({ status: "sent" });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: "ada@example.com" });
    expect(email.sent[0]!.subject).toContain("Ada");
  });

  it("is idempotent: running twice for the same user sends once", async () => {
    const user = await users.create({ email: "ada@example.com", name: "Ada" });
    const email = new FakeEmailSender();
    const process = make(email);
    await process({ data: { userId: user.id } });
    expect(await process({ data: { userId: user.id } })).toEqual({ status: "skipped" });
    expect(email.sent, "at-least-once delivery must not mean two welcome emails").toHaveLength(1);
  });

  it("two concurrent runs for the same user send once (the other one backs off)", async () => {
    const user = await users.create({ email: "ada@example.com", name: "Ada" });
    const email = new FakeEmailSender(0, 50);
    const process = make(email);
    const results = await Promise.allSettled([process({ data: { userId: user.id } }), process({ data: { userId: user.id } })]);
    expect(email.sent).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected, "the loser should throw a normal (retryable) error").toBeDefined();
    if (rejected?.status === "rejected") expect(rejected.reason).not.toBeInstanceOf(UnrecoverableError);
  });

  it("a failed send releases the claim so the retry can send", async () => {
    const user = await users.create({ email: "ada@example.com", name: "Ada" });
    const email = new FakeEmailSender(1);
    const process = make(email);
    await expect(process({ data: { userId: user.id } })).rejects.toThrow(/503/);
    expect(await process({ data: { userId: user.id } }), "retry must not be blocked by a stale claim").toEqual({
      status: "sent",
    });
    expect(email.sent).toHaveLength(1);
  });

  it("passes a stable idempotency key to the provider", async () => {
    const user = await users.create({ email: "ada@example.com", name: "Ada" });
    const email = new FakeEmailSender(1);
    const process = make(email);
    await process({ data: { userId: user.id } }).catch(() => {});
    await process({ data: { userId: user.id } });
    expect(email.sent[0]!.idempotencyKey).toContain(user.id);
  });

  it("a missing user is an UnrecoverableError (retrying can't fix it)", async () => {
    const email = new FakeEmailSender();
    await expect(make(email)({ data: { userId: "nope" } })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(email.attempts).toBe(0);
  });
});

describe("avatar thumbnail processor (TODO 6)", () => {
  it("creates the thumbnail and stores it on the user", async () => {
    const users = new InMemoryUserRepository();
    const user = await users.create({ email: "a@x.io", name: "A", avatarUrl: "https://img.test/a.png" });
    const thumbnailer = new FakeThumbnailer();
    const result = await createAvatarThumbnailProcessor({ users, thumbnailer })({
      data: { userId: user.id, imageUrl: "https://img.test/a.png" },
    });
    expect(result.thumbnailUrl).toContain("cdn.test");
    expect((await users.findById(user.id))?.avatarThumbnailUrl).toBe(result.thumbnailUrl);
  });

  it.each(["not a url", "ftp://files.test/a.png", "javascript:alert(1)", ""])(
    "rejects %j as unrecoverable without calling the thumbnailer",
    async (imageUrl) => {
      const users = new InMemoryUserRepository();
      const user = await users.create({ email: "a@x.io", name: "A" });
      const thumbnailer = new FakeThumbnailer();
      const process = createAvatarThumbnailProcessor({ users, thumbnailer });
      await expect(process({ data: { userId: user.id, imageUrl } })).rejects.toBeInstanceOf(UnrecoverableError);
      expect(thumbnailer.started).toBe(0);
    },
  );

  it("a missing user is unrecoverable", async () => {
    const process = createAvatarThumbnailProcessor({
      users: new InMemoryUserRepository(),
      thumbnailer: new FakeThumbnailer(),
    });
    await expect(process({ data: { userId: "nope", imageUrl: "https://img.test/a.png" } })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it("a thumbnailer failure is NOT unrecoverable (it should be retried)", async () => {
    const users = new InMemoryUserRepository();
    const user = await users.create({ email: "a@x.io", name: "A" });
    const process = createAvatarThumbnailProcessor({ users, thumbnailer: new FakeThumbnailer(1) });
    const err = await process({ data: { userId: user.id, imageUrl: "https://img.test/a.png" } }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnrecoverableError);
  });
});
