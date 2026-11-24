/** TODO(1): typed, fail-fast config. */
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

function configError(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err, "loadConfig should throw a ConfigError").toBeInstanceOf(ConfigError);
    return err as ConfigError;
  }
  throw new Error(`expected loadConfig(${JSON.stringify(env)}) to throw`);
}

const KEY = "k".repeat(16);

describe("loadConfig (TODO 1)", () => {
  afterEach(() => {
    delete process.env.PORT;
  });

  it("applies development defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      env: "development",
      port: 3000,
      logLevel: "debug",
      pagination: { defaultLimit: 20, maxLimit: 100 },
      apiKey: undefined,
    });
  });

  it("coerces numeric strings and reads every variable", () => {
    expect(
      loadConfig({
        NODE_ENV: "development",
        PORT: "8080",
        LOG_LEVEL: "warn",
        DEFAULT_PAGE_SIZE: "10",
        MAX_PAGE_SIZE: "50",
        API_KEY: KEY,
      }),
    ).toEqual({
      env: "development",
      port: 8080,
      logLevel: "warn",
      pagination: { defaultLimit: 10, maxLimit: 50 },
      apiKey: KEY,
    });
  });

  it.each([
    ["test", "silent"],
    ["production", "info"],
  ])("defaults LOG_LEVEL per environment (NODE_ENV=%s → %s)", (env, level) => {
    expect(loadConfig({ NODE_ENV: env, API_KEY: KEY }).logLevel).toBe(level);
  });

  it("treats empty strings as unset", () => {
    expect(loadConfig({ PORT: "", LOG_LEVEL: "" })).toMatchObject({ port: 3000, logLevel: "debug" });
  });

  it("requires API_KEY in production", () => {
    const err = configError({ NODE_ENV: "production" });
    expect(err.message).toContain("API_KEY");
  });

  it("rejects an API_KEY shorter than 16 characters", () => {
    const err = configError({ API_KEY: "short" });
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0]).toMatch(/^API_KEY: /);
  });

  it("rejects DEFAULT_PAGE_SIZE larger than MAX_PAGE_SIZE", () => {
    const err = configError({ DEFAULT_PAGE_SIZE: "50", MAX_PAGE_SIZE: "10" });
    expect(err.issues[0]).toMatch(/^DEFAULT_PAGE_SIZE: /);
  });

  it("reports EVERY invalid variable at once, each prefixed with its name", () => {
    const err = configError({ PORT: "http", LOG_LEVEL: "loud", DEFAULT_PAGE_SIZE: "0", NODE_ENV: "staging" });
    expect(err.issues).toHaveLength(4);
    for (const name of ["PORT", "LOG_LEVEL", "DEFAULT_PAGE_SIZE", "NODE_ENV"]) {
      expect(err.issues.some((i) => i.startsWith(`${name}: `)), `missing an issue for ${name}`).toBe(true);
      expect(err.message).toContain(name);
    }
  });

  it.each(["0", "70000", "3.5"])("rejects PORT=%s", (port) => {
    expect(configError({ PORT: port }).issues[0]).toMatch(/^PORT: /);
  });

  it("reads only the env object it is given", () => {
    process.env.PORT = "1234";
    expect(loadConfig({}).port).toBe(3000);
  });
});
