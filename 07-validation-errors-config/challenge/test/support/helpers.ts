import type { Config } from "../../src/config.js";
import type { Logger } from "../../src/lib/logger.js";
import { createApp } from "../../src/app.js";
import { createContainer } from "../../src/container.js";

/** A literal config so HTTP tests don't depend on loadConfig (TODO 1). */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    env: "test",
    port: 0,
    logLevel: "silent",
    pagination: { defaultLimit: 20, maxLimit: 100 },
    apiKey: undefined,
    ...overrides,
  };
}

export interface LogCall {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

/** Captures log calls instead of printing them. */
export function memoryLogger(): Logger & { calls: LogCall[] } {
  const calls: LogCall[] = [];
  const at = (level: LogCall["level"]) => (message: string, meta?: Record<string, unknown>) => {
    calls.push({ level, message, meta });
  };
  return { calls, debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}

export function buildApp(overrides: Partial<Config> = {}) {
  const logger = memoryLogger();
  const app = createApp(createContainer({ config: testConfig(overrides), logger }));
  return { app, logger };
}

export const validProduct = (overrides: Record<string, unknown> = {}) => ({
  sku: "TSHIRT-RED-M",
  name: "Red T-shirt (M)",
  category: "apparel",
  priceCents: 1999,
  stock: 10,
  ...overrides,
});
