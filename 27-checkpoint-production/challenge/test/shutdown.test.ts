import { EventEmitter, once } from "node:events";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import { Redis } from "ioredis";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createServerLifecycle, installSignalHandlers } from "../src/lib/lifecycle.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_27";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380/11";

function get(port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path, agent: false }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

const refused = (port: number) =>
  new Promise<string>((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.once("connect", () => (s.destroy(), resolve("connected")));
    s.once("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "error"));
  });

describe("graceful shutdown", () => {
  it("drains in-flight requests, refuses new ones, then closes Postgres and Redis in order", async () => {
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    const redis = new Redis(REDIS_URL);
    await pool.query("SELECT 1");
    await redis.ping();

    try {
      const order: string[] = [];
      let release!: () => void;
      let arrived!: () => void;
      const arrivedP = new Promise<void>((r) => (arrived = r));
      const handler = (_req: IncomingMessage, res: ServerResponse) => {
        arrived();
        release = () => {
          res.end("done");
          order.push("response");
        };
      };

      const lifecycle = createServerLifecycle({
        handler,
        port: 0,
        host: "127.0.0.1",
        drainTimeoutMs: 5_000,
        onShutdown: [
          { name: "postgres", close: async () => (order.push("postgres"), await pool.end()) },
          {
            name: "redis",
            close: async () => {
              order.push("redis");
              const ended = once(redis, "end");
              await redis.quit();
              await ended;
            },
          },
        ],
      });
      const port = await lifecycle.start();
      const inFlight = get(port, "/slow");
      await arrivedP;

      const done = lifecycle.shutdown("test");
      expect(lifecycle.isShuttingDown()).toBe(true);
      expect(await refused(port)).toBe("ECONNREFUSED");
      release();
      expect((await inFlight).body).toBe("done");

      const report = await done;
      expect(report.forced).toBe(false);
      expect(order).toEqual(["response", "postgres", "redis"]);
      expect(pool.ended).toBe(true);
      expect(redis.status).toBe("end");
    } finally {
      if (!pool.ended) await pool.end();
      if (redis.status !== "end") redis.disconnect();
    }
  });

  it("forces the drain after the timeout", async () => {
    const lifecycle = createServerLifecycle({ handler: () => {}, port: 0, host: "127.0.0.1", drainTimeoutMs: 150 });
    const port = await lifecycle.start();
    const hung = get(port, "/hang").catch(() => "destroyed");
    await new Promise((r) => setTimeout(r, 50));
    const report = await lifecycle.shutdown();
    expect(report.forced).toBe(true);
    expect(await hung).toBe("destroyed");
  });

  it("SIGTERM triggers shutdown and exit(0)", async () => {
    const emitter = new EventEmitter();
    const codes: number[] = [];
    installSignalHandlers(
      { shutdown: async () => ({ forced: false, durationMs: 1, hookErrors: [] }) },
      { on: (s, l) => emitter.on(s, l), exit: (c) => void codes.push(c) },
    );
    emitter.emit("SIGTERM");
    await new Promise((r) => setImmediate(r));
    expect(codes).toEqual([0]);
  });
});
