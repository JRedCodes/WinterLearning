import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/realtime/protocol.js";

describe("parseClientMessage (TODO 1)", () => {
  it("accepts join, leave and message frames", () => {
    expect(parseClientMessage('{"type":"join","room":"general"}')).toEqual({
      ok: true,
      message: { type: "join", room: "general" },
    });
    expect(parseClientMessage('{"type":"leave","room":"dev-ops-2"}')).toEqual({
      ok: true,
      message: { type: "leave", room: "dev-ops-2" },
    });
    expect(parseClientMessage('{"type":"message","room":"general","text":"hi"}')).toEqual({
      ok: true,
      message: { type: "message", room: "general", text: "hi" },
    });
  });

  it("trims message text and drops unknown fields", () => {
    const result = parseClientMessage('{"type":"message","room":"general","text":"  hello  ","admin":true}');
    expect(result).toEqual({ ok: true, message: { type: "message", room: "general", text: "hello" } });
  });

  it("returns BAD_JSON for frames that are not JSON (and never throws)", () => {
    for (const raw of ["", "{", "hello", '{"type":"join",}']) {
      const result = parseClientMessage(raw);
      expect(result.ok, `input ${JSON.stringify(raw)}`).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("BAD_JSON");
        expect(result.error).toEqual(expect.any(String));
      }
    }
  });

  it.each([
    ["an unknown type", { type: "shout", room: "general" }],
    ["a missing type", { room: "general" }],
    ["a JSON array", ["join", "general"]],
    ["a JSON string", "join"],
    ["null", null],
    ["a missing room", { type: "join" }],
    ["an uppercase room", { type: "join", room: "General" }],
    ["a room with spaces", { type: "join", room: "my room" }],
    ["a room starting with a dash", { type: "join", room: "-x" }],
    ["a room over 32 chars", { type: "join", room: "a".repeat(33) }],
    ["a non-string room", { type: "join", room: 7 }],
    ["missing text", { type: "message", room: "general" }],
    ["blank text", { type: "message", room: "general", text: "   " }],
    ["text over 500 chars", { type: "message", room: "general", text: "x".repeat(501) }],
    ["non-string text", { type: "message", room: "general", text: { evil: true } }],
  ])("returns INVALID_MESSAGE for %s", (_label, value) => {
    const result = parseClientMessage(JSON.stringify(value));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_MESSAGE");
      expect(result.error.length, "error should say what was wrong").toBeGreaterThan(0);
    }
  });

  it("accepts text of exactly 500 chars and a 32-char room", () => {
    const result = parseClientMessage(JSON.stringify({ type: "message", room: "a".repeat(32), text: "y".repeat(500) }));
    expect(result.ok).toBe(true);
  });
});
