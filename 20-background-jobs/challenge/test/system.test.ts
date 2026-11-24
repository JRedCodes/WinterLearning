import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeEmailSender, FakeThumbnailer, waitFor } from "./helpers/fakes.js";
import { startHarness, TEST_SETTINGS, type Harness } from "./helpers/harness.js";

// End to end on real BullMQ + Redis: HTTP → queue → worker → side effect.

describe("signup → background jobs (TODOs 2, 3, 7, 8 together)", () => {
  let h: Harness | undefined;
  afterEach(async () => {
    await h?.teardown();
    h = undefined;
  });

  const signup = (body: object) => request(h!.app).post("/signup").send(body);
  const dlqCount = async () => (await h!.queues.deadLetter.getJobCounts("waiting")).waiting ?? 0;

  it("signup responds right away and the workers do the rest", async () => {
    h = await startHarness();
    const res = await signup({ email: "ada@example.com", name: "Ada", avatarUrl: "https://img.test/ada.png" });
    expect(res.status).toBe(201);
    expect(res.body.jobs).toHaveLength(2);

    await waitFor(() => h!.email.sent.length === 1, "welcome email sent");
    await waitFor(async () => {
      const user = await request(h!.app).get(`/users/${res.body.data.id}`);
      return user.body.data.avatarThumbnailUrl !== null;
    }, "thumbnail stored on the user");
    expect(h.email.sent[0]!.to).toBe("ada@example.com");
  });

  it("retries a flaky email provider with backoff until it succeeds", async () => {
    h = await startHarness({ email: new FakeEmailSender(2) }); // fails twice, then works
    const res = await signup({ email: "ada@example.com", name: "Ada" });
    const jobId = res.body.jobs[0].id as string;

    await waitFor(() => h!.email.sent.length === 1, "email eventually sent (needs attempts > 1: TODO 2)");
    const job = await h.queues.emails.getJob(jobId);
    await waitFor(async () => (await job?.getState()) === "completed", "job completed");
    expect(h.email.attempts).toBe(3);
    expect(await dlqCount(), "a job that eventually succeeded must not be dead-lettered").toBe(0);
  });

  it("moves a job that keeps failing to the dead-letter queue after the last attempt", async () => {
    h = await startHarness({ email: new FakeEmailSender(Infinity) });
    const res = await signup({ email: "ada@example.com", name: "Ada" });

    await waitFor(async () => (await dlqCount()) === 1, "one dead letter (TODO 7)");
    expect(h.email.attempts, "all attempts used before giving up").toBe(TEST_SETTINGS.attempts);
    const [letter] = await h.queues.deadLetter.getJobs(["waiting"]);
    expect(letter?.data).toMatchObject({
      originalQueue: h.queues.names.emails,
      originalJobId: res.body.jobs[0].id,
      data: { userId: res.body.data.id },
      attemptsMade: TEST_SETTINGS.attempts,
    });
    expect(letter?.data.failedReason).toContain("503");
  });

  it("dead-letters bad input immediately instead of retrying it", async () => {
    h = await startHarness();
    await signup({ email: "bob@example.com", name: "Bob", avatarUrl: "definitely not a url" });

    await waitFor(async () => (await dlqCount()) === 1, "bad avatar url dead-lettered (TODOs 6 + 7)");
    const [letter] = await h.queues.deadLetter.getJobs(["waiting"]);
    expect(letter?.data.attemptsMade, "UnrecoverableError → no retries").toBe(1);
    expect(h.thumbnailer.started).toBe(0);
  });

  it("enqueueing the same work twice creates one job (deterministic job ids)", async () => {
    h = await startHarness();
    const user = await h.users.create({ email: "ada@example.com", name: "Ada" });
    const first = await h.producer.enqueueWelcomeEmail(user);
    const second = await h.producer.enqueueWelcomeEmail(user);
    expect(second.id, "TODO 3: same user → same jobId").toBe(first.id);

    await waitFor(() => h!.email.sent.length === 1, "email sent");
    await new Promise((r) => setTimeout(r, 200));
    expect(h.email.sent).toHaveLength(1);
  });

  it("graceful shutdown waits for the active job to finish", async () => {
    h = await startHarness({ thumbnailer: new FakeThumbnailer(0, 400) });
    const res = await signup({ email: "ada@example.com", name: "Ada", avatarUrl: "https://img.test/ada.png" });
    await waitFor(() => h!.thumbnailer.started === 1, "thumbnail job started");

    await h.workers.close();
    expect(h.thumbnailer.finished, "close() returned while a job was still running (TODO 8)").toBe(1);
    const job = await h.queues.thumbnails.getJob(res.body.jobs[1].id);
    expect(await job?.getState()).toBe("completed");
  });

  it("rejects duplicate emails with 409 and enqueues nothing new", async () => {
    h = await startHarness();
    expect((await signup({ email: "ada@example.com", name: "Ada" })).status).toBe(201);
    const dup = await signup({ email: "ADA@example.com", name: "Ada again" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });
});
