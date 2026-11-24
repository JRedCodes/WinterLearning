import { describe, expect, it } from "vitest";
import { defaultJobOptions } from "../src/jobs/queues.js";

describe("defaultJobOptions (TODO 2)", () => {
  const opts = defaultJobOptions({ attempts: 4, backoff: { baseMs: 10, maxMs: 100 } });

  it("retries according to the settings, using the custom backoff strategy", () => {
    expect(opts.attempts).toBe(4);
    expect(opts.backoff).toEqual({ type: "custom" });
  });

  it("keeps a bounded history of completed jobs (not forever, not zero)", () => {
    expect(opts.removeOnComplete, "keeping completed jobs forever slowly fills Redis").toBeDefined();
    expect(opts.removeOnComplete, "`true` deletes immediately; jobId dedupe and debugging need some history").not.toBe(
      true,
    );
    expect(typeof opts.removeOnComplete).toBe("object");
  });

  it("keeps failed jobs, bounded", () => {
    expect(opts.removeOnFail).toBeDefined();
    expect(opts.removeOnFail, "failed jobs are what you debug; don't delete them right away").not.toBe(true);
    expect(typeof opts.removeOnFail).toBe("object");
  });
});
