import { describe, expect, it } from "vitest";
import { decodeOrderEvent } from "../src/consumer/decode.js";
import type { ConsumedMessage } from "../src/messaging/types.js";

const event = {
  type: "OrderPlaced",
  eventId: "evt-1",
  occurredAt: "2026-01-15T10:00:00.000Z",
  orderId: "order-1",
  customerId: "cust-1",
  totalCents: 1500,
};

function record(over: { value?: string | null; headers?: Record<string, string | undefined> } = {}): ConsumedMessage {
  const headers: Record<string, string> = {};
  const merged = { "event-type": "OrderPlaced", "event-version": "1", "event-id": "evt-1", ...over.headers };
  for (const [k, v] of Object.entries(merged)) if (v !== undefined) headers[k] = v;
  return {
    key: "order-1",
    value: over.value === undefined ? JSON.stringify(event) : over.value,
    headers,
    offset: "0",
    timestamp: "0",
  };
}

function expectRejected(message: ConsumedMessage, reason: RegExp) {
  const result = decodeOrderEvent(message);
  expect(result.ok, "expected decoding to fail").toBe(false);
  if (!result.ok) expect(result.reason).toMatch(reason);
}

describe("decodeOrderEvent (TODO 4)", () => {
  it("decodes a valid record", () => {
    expect(decodeOrderEvent(record())).toEqual({ ok: true, event });
  });

  it("decodes a valid OrderCancelled", () => {
    const c = { ...event, type: "OrderCancelled", reason: "out of stock" };
    const result = decodeOrderEvent(record({ value: JSON.stringify(c), headers: { "event-type": "OrderCancelled" } }));
    expect(result).toEqual({ ok: true, event: c });
  });

  it("rejects a record without an event-type header", () => {
    expectRejected(record({ headers: { "event-type": undefined } }), /missing/i);
  });

  it("rejects unknown event types", () => {
    expectRejected(record({ headers: { "event-type": "OrderShipped" } }), /unknown/i);
  });

  it("rejects versions it doesn't understand", () => {
    expectRejected(record({ headers: { "event-version": "2" } }), /unsupported/i);
    expectRejected(record({ headers: { "event-version": undefined } }), /unsupported/i);
  });

  it("rejects tombstones (null value)", () => {
    expectRejected(record({ value: null }), /empty/i);
  });

  it("rejects malformed JSON without throwing", () => {
    expect(() => decodeOrderEvent(record({ value: "{not json" }))).not.toThrow();
    expectRejected(record({ value: "{not json" }), /JSON/);
  });

  it("rejects payloads that fail the schema", () => {
    expectRejected(record({ value: JSON.stringify({ ...event, totalCents: "15.00" }) }), /schema/i);
    expectRejected(record({ value: JSON.stringify({ ...event, customerId: undefined }) }), /schema/i);
  });

  it("rejects a payload whose type disagrees with the header", () => {
    const c = { ...event, type: "OrderCancelled", reason: "x" };
    expectRejected(record({ value: JSON.stringify(c) }), /match/i);
  });
});
