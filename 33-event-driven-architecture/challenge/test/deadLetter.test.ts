import { describe, expect, it, vi } from "vitest";
import { withDeadLetter } from "../src/consumers/deadLetter.js";
import { PermanentError } from "../src/consumers/errors.js";
import type { ConsumedEvent } from "../src/events/eventBus.js";
import { InMemoryEventBus } from "../src/events/inMemoryEventBus.js";

/** Symptom 5: one bad message froze payments for a whole partition. */
const DLQ = "orders.v1.payments-dlq";

function record(offset: string, value = `{"n":${offset}}`): ConsumedEvent {
  return {
    topic: "orders.v1",
    partition: 2,
    offset,
    key: `order-${offset}`,
    value,
    headers: { "event-type": "OrderPlaced", "event-version": "2", "event-id": `evt-${offset}` },
  };
}

/**
 * Records requested delays without waiting. If the wrapper keeps retrying
 * forever, this throws after 20 sleeps so the test fails instead of hanging.
 */
function fakeSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
    if (delays.length > 20) throw new Error("retried more than 20 times: this message would block its partition forever");
  };
  return { delays, sleep };
}

function setup(maxAttempts = 3) {
  const bus = new InMemoryEventBus();
  const { delays, sleep } = fakeSleep();
  const wrap = (handler: (e: ConsumedEvent) => Promise<void>) =>
    withDeadLetter(handler, { bus, dlqTopic: DLQ, maxAttempts, backoffMs: 100, sleep, now: () => new Date("2026-01-15T10:00:00.000Z") });
  return { bus, delays, wrap };
}

describe("withDeadLetter", () => {
  it("passes successful messages straight through", async () => {
    const { bus, wrap } = setup();
    const handler = vi.fn(async () => {});
    await wrap(handler)(record("1"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.messages(DLQ)).toHaveLength(0);
  });

  it("retries a transient failure with backoff and succeeds", async () => {
    const { bus, delays, wrap } = setup();
    const handler = vi.fn().mockRejectedValueOnce(new Error("db timeout")).mockResolvedValue(undefined);
    await wrap(handler)(record("1"));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([100]);
    expect(bus.messages(DLQ)).toHaveLength(0);
  });

  it("gives up after maxAttempts, dead-letters the original message with diagnostics, and lets the consumer move on", async () => {
    const { bus, delays, wrap } = setup(3);
    const handler = vi.fn().mockRejectedValue(new Error("db timeout"));
    const original = record("41");
    await expect(wrap(handler)(original), "the wrapper must resolve so the offset can be committed").resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(delays, "exponential backoff between attempts (none after the last)").toEqual([100, 200]);
    const dlq = bus.messages(DLQ);
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.key).toBe(original.key);
    expect(dlq[0]!.value, "the DLQ must keep the original payload so it can be replayed").toBe(original.value);
    expect(dlq[0]!.headers).toMatchObject({
      ...original.headers,
      "dlq-original-topic": "orders.v1",
      "dlq-original-partition": "2",
      "dlq-original-offset": "41",
      "dlq-attempts": "3",
    });
    expect(dlq[0]!.headers["dlq-error"]).toContain("db timeout");
  });

  it("dead-letters a PermanentError immediately, without retries", async () => {
    const { bus, delays, wrap } = setup(5);
    const handler = vi.fn().mockRejectedValue(new PermanentError("unsupported OrderPlaced version: 3"));
    await wrap(handler)(record("7"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
    expect(bus.messages(DLQ)[0]!.headers).toMatchObject({ "dlq-attempts": "1" });
    expect(bus.messages(DLQ)[0]!.headers["dlq-error"]).toContain("unsupported");
  });

  it("does NOT swallow the message if the dead-letter publish itself fails", async () => {
    const { bus, wrap } = setup(2);
    bus.failNext(1);
    const handler = vi.fn().mockRejectedValue(new PermanentError("bad"));
    await expect(wrap(handler)(record("9")), "if the DLQ write fails, the offset must not be committed").rejects.toThrow();
  });

  it("a poison message no longer blocks the messages behind it", async () => {
    const { bus, wrap } = setup(3);
    const processed: string[] = [];
    const handle = wrap(async (e) => {
      if (e.value === "poison") throw new Error("Cannot read properties of undefined (reading 'amountCents')");
      processed.push(e.offset);
    });
    // what a consumer does for one partition: messages strictly one after another
    for (const r of [record("1"), record("2", "poison"), record("3"), record("4")]) await handle(r);
    expect(processed).toEqual(["1", "3", "4"]);
    expect(bus.messages(DLQ).map((m) => m.headers["dlq-original-offset"])).toEqual(["2"]);
  });
});
