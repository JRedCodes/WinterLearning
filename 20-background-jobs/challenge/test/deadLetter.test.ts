import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError, type Job } from "bullmq";
import { isFinalAttempt, withDeadLetter, type DeadLetterSink } from "../src/jobs/deadLetter.js";
import type { DeadLetterData } from "../src/jobs/types.js";

/** Just enough of a BullMQ Job for the wrapper. */
function fakeJob(attemptsMade: number, attempts = 3) {
  return {
    id: "42",
    name: "welcome-email",
    queueName: "app-emails",
    data: { userId: "u1" },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<{ userId: string }>;
}

function sink() {
  const letters: Array<{ name: string; data: DeadLetterData; opts?: { jobId?: string } }> = [];
  const s: DeadLetterSink = {
    add: async (name, data, opts) => {
      letters.push(opts ? { name, data, opts } : { name, data });
    },
  };
  return { s, letters };
}

describe("dead-letter handling (TODO 7)", () => {
  it("isFinalAttempt: counts attempts, and unrecoverable errors are always final", () => {
    const err = new Error("x");
    expect(isFinalAttempt(fakeJob(0, 3), err)).toBe(false);
    expect(isFinalAttempt(fakeJob(1, 3), err)).toBe(false);
    expect(isFinalAttempt(fakeJob(2, 3), err)).toBe(true);
    expect(isFinalAttempt(fakeJob(0, 3), new UnrecoverableError("bad input"))).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 0, opts: {} } as Job, err), "no attempts option = 1 attempt").toBe(true);
  });

  it("passes results through untouched on success", async () => {
    const { s, letters } = sink();
    const wrapped = withDeadLetter(async () => "ok", s);
    expect(await wrapped(fakeJob(0))).toBe("ok");
    expect(letters).toHaveLength(0);
  });

  it("does not dead-letter a failure that will be retried, but still rethrows it", async () => {
    const { s, letters } = sink();
    const boom = new Error("503");
    const wrapped = withDeadLetter(async () => {
      throw boom;
    }, s);
    await expect(wrapped(fakeJob(0))).rejects.toBe(boom);
    expect(letters).toHaveLength(0);
  });

  it("dead-letters the final failure with everything needed to investigate or replay", async () => {
    const { s, letters } = sink();
    const wrapped = withDeadLetter(async () => {
      throw new Error("provider down");
    }, s);
    await expect(wrapped(fakeJob(2))).rejects.toThrow("provider down");
    expect(letters).toHaveLength(1);
    expect(letters[0]!.data).toMatchObject({
      originalQueue: "app-emails",
      originalJobId: "42",
      name: "welcome-email",
      data: { userId: "u1" },
      failedReason: "provider down",
      attemptsMade: 3,
    });
    expect(new Date(letters[0]!.data.failedAt).toString()).not.toBe("Invalid Date");
    expect(letters[0]!.opts?.jobId, "a deterministic DLQ job id prevents duplicates").toBe("app-emails-42");
  });

  it("dead-letters an UnrecoverableError on the first attempt", async () => {
    const { s, letters } = sink();
    const wrapped = withDeadLetter(async () => {
      throw new UnrecoverableError("bad url");
    }, s);
    await expect(wrapped(fakeJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(letters).toHaveLength(1);
    expect(letters[0]!.data.attemptsMade).toBe(1);
  });

  it("if the DLQ write fails, reports it and still rethrows the ORIGINAL error", async () => {
    const onSinkError = vi.fn();
    const broken: DeadLetterSink = { add: () => Promise.reject(new Error("redis down")) };
    const wrapped = withDeadLetter(
      async () => {
        throw new Error("original");
      },
      broken,
      onSinkError,
    );
    await expect(wrapped(fakeJob(2))).rejects.toThrow("original");
    expect(onSinkError).toHaveBeenCalledTimes(1);
  });
});
