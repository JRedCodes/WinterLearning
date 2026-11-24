import { describe, expect, it } from "vitest";
import { err, ok } from "../src/result.js";
import { isLogLevel, LOG_LEVELS, parseConfig } from "../src/parseConfig.js";

describe("ok / err (TODO 5)", () => {
  it("build the two Result variants", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });
});

describe("isLogLevel (TODO 5)", () => {
  it.each(LOG_LEVELS)("accepts %s", (level) => {
    expect(isLogLevel(level)).toBe(true);
  });

  it.each([["verbose"], ["INFO"], [""], [1], [null], [undefined], [["info"]]])("rejects %j", (value) => {
    expect(isLogLevel(value)).toBe(false);
  });
});

describe("parseConfig (TODO 5)", () => {
  it("accepts a full valid config", () => {
    const result = parseConfig({ port: 8080, host: "0.0.0.0", logLevel: "debug", features: ["beta"] });
    expect(result).toEqual({
      ok: true,
      value: { port: 8080, host: "0.0.0.0", logLevel: "debug", features: ["beta"] },
    });
  });

  it("fills in defaults for optional fields", () => {
    expect(parseConfig({ port: 3000 })).toEqual({
      ok: true,
      value: { port: 3000, host: "localhost", logLevel: "info", features: [] },
    });
  });

  it.each([[null], ["port=3000"], [42], [[1, 2]], [undefined]])("rejects a non-object input (%j)", (input) => {
    const result = parseConfig(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual([{ path: "", message: expect.any(String) }]);
  });

  it("requires port", () => {
    const result = parseConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((e) => e.path)).toEqual(["port"]);
  });

  it.each([["8080"], [0], [65536], [80.5], [-1], [Number.NaN]])("rejects port %j", (port) => {
    const result = parseConfig({ port });
    expect(result.ok, `port ${String(port)} should be rejected`).toBe(false);
    if (!result.ok) expect(result.error.map((e) => e.path)).toEqual(["port"]);
  });

  it("rejects an unknown log level", () => {
    const result = parseConfig({ port: 80, logLevel: "verbose" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]?.path).toBe("logLevel");
      expect(result.error[0]?.message).toMatch(/debug.*info.*warn.*error/);
    }
  });

  it("rejects a blank or non-string host", () => {
    for (const host of ["", "   ", 127]) {
      const result = parseConfig({ port: 80, host });
      expect(result.ok, `host ${JSON.stringify(host)} should be rejected`).toBe(false);
      if (!result.ok) expect(result.error.map((e) => e.path)).toEqual(["host"]);
    }
  });

  it("reports the index of each bad feature", () => {
    const result = parseConfig({ port: 80, features: ["a", 2, "c", false] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((e) => e.path)).toEqual(["features[1]", "features[3]"]);
  });

  it("rejects features that are not an array", () => {
    const result = parseConfig({ port: 80, features: "beta" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((e) => e.path)).toEqual(["features"]);
  });

  it("collects EVERY error instead of stopping at the first", () => {
    const result = parseConfig({ port: "80", host: "", logLevel: "loud", features: [1] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((e) => e.path)).toEqual(["port", "host", "logLevel", "features[0]"]);
      for (const e of result.error) expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("does not copy unknown fields into the config", () => {
    const result = parseConfig({ port: 80, isAdmin: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty("isAdmin");
  });
});
