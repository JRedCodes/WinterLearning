/**
 * config.ts is the ONE place that reads environment variables. It parses them
 * once, at startup, into a typed object and fails fast on nonsense.
 * (Module 07 redoes this with zod.)
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig(env)", () => {
  afterEach(() => {
    delete process.env.MAX_PARTY_SIZE;
  });

  it("uses safe defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({ port: 3000, maxPartySize: 6 });
  });

  it("reads values from the env object it is given", () => {
    expect(loadConfig({ PORT: "8080", MAX_PARTY_SIZE: "2" })).toEqual({ port: 8080, maxPartySize: 2 });
  });

  it("only looks at the env object passed in (testable without touching process.env)", () => {
    process.env.MAX_PARTY_SIZE = "99";
    expect(loadConfig({}).maxPartySize).toBe(6);
  });

  it.each([
    ["MAX_PARTY_SIZE", "zero"],
    ["MAX_PARTY_SIZE", "0"],
    ["MAX_PARTY_SIZE", "2.5"],
    ["PORT", "http"],
  ])("fails fast on %s=%s with a message naming the variable", (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });
});
