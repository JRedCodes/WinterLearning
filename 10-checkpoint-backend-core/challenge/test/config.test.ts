import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig (typed, validated config)", () => {
  it("applies defaults", () => {
    expect(loadConfig({})).toEqual({ port: 3000, nodeEnv: "development" });
  });

  it("parses values from the environment", () => {
    expect(loadConfig({ PORT: "8080", NODE_ENV: "production" })).toEqual({ port: 8080, nodeEnv: "production" });
  });

  it.each([["abc"], ["0"], ["70000"], ["80.5"]])("rejects PORT=%s and names the variable", (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("reports every invalid variable at once", () => {
    expect(() => loadConfig({ PORT: "nope", NODE_ENV: "staging" })).toThrow(/PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/);
  });
});
