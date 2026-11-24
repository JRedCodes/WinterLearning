import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/domain/errors.js";
import { decodeCursor, encodeCursor } from "../src/lib/cursor.js";

const payload = { createdAt: "2026-01-01T00:00:01.000Z", id: "7a1f0b2c-0000-4000-8000-000000000000", sort: "createdAt" };

describe("TODO(3) · opaque cursors", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("is URL-safe and opaque (base64url, no readable field names)", () => {
    const c = encodeCursor(payload);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(c).not.toContain("createdAt");
  });

  it.each([
    ["garbage", "%%%not-a-cursor%%%"],
    ["base64 of non-JSON", Buffer.from("hello").toString("base64url")],
    ["JSON array", Buffer.from("[1,2]").toString("base64url")],
    ["missing id", Buffer.from(JSON.stringify({ createdAt: payload.createdAt, sort: "createdAt" })).toString("base64url")],
    ["numeric id", Buffer.from(JSON.stringify({ ...payload, id: 42 })).toString("base64url")],
    ["invalid date", Buffer.from(JSON.stringify({ ...payload, createdAt: "yesterday" })).toString("base64url")],
  ])("rejects %s with a ValidationError on /cursor", (_label, raw) => {
    let caught: unknown;
    try {
      decodeCursor(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).errors[0]?.pointer).toBe("/cursor");
  });
});
