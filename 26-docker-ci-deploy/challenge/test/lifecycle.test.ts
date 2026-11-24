import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerLifecycle, type ServerLifecycle } from "../src/lib/lifecycle.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_26";

/** A handler with a /slow route we control from the test, plus a fast / route. */
function controllableHandler() {
  const events: string[] = [];
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let markArrived!: () => void;
  const arrived = new Promise<void>((r) => (markArrived = r));

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/slow") {
      events.push("slow:start");
      markArrived();
      void released.then(() => {
        res.end("slow done");
        events.push("slow:end");
      });
      return;
    }
    if (req.url === "/hang") {
      markArrived();
      return; // never responds
    }
    res.end("ok");
  };
  return { handler, events, release, arrived };
}

/** Raw HTTP GET with its own agent so the test controls keep-alive. */
function get(port: number, path: string, agent: http.Agent | false = false) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function tryConnect(port: number) {
  return new Promise<"connected" | string>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", (err: NodeJS.ErrnoException) => resolve(err.code ?? "error"));
  });
}

let current: ServerLifecycle | undefined;
afterEach(async () => {
  // Never leave a server listening, even if a test failed half-way.
  if (current && !current.isShuttingDown()) await current.shutdown("test cleanup").catch(() => {});
  current = undefined;
});

describe("createServerLifecycle (TODO 5)", () => {
  it("starts on the requested port and serves requests", async () => {
    const { handler } = controllableHandler();
    current = createServerLifecycle({ handler, port: 0, host: "127.0.0.1", drainTimeoutMs: 1_000 });
    expect(current.state).toBe("idle");
    const port = await current.start();
    expect(port, "start() should resolve with the real port when port is 0").toBeGreaterThan(0);
    expect(current.state).toBe("running");
    expect(current.isShuttingDown()).toBe(false);
    expect((await get(port, "/")).body).toBe("ok");
  });

  it("lets an in-flight request finish, refuses new connections, then closes the pool", async () => {
    const { handler, events, release, arrived } = controllableHandler();
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    await pool.query("SELECT 1"); // the pool really has an open connection
    const poolClose = vi.fn(async () => {
      events.push("pool:close");
      await pool.end();
    });

    current = createServerLifecycle({
      handler,
      port: 0,
      host: "127.0.0.1",
      drainTimeoutMs: 5_000,
      onShutdown: [{ name: "postgres", close: poolClose }],
    });
    const port = await current.start();

    const inFlight = get(port, "/slow");
    await arrived;

    const shutdown = current.shutdown("test");
    expect(current.state, "state flips to draining synchronously").toBe("draining");
    expect(current.isShuttingDown()).toBe(true);

    // The listener is closed: brand-new connections are refused while we drain.
    expect(await tryConnect(port)).toBe("ECONNREFUSED");
    expect(poolClose, "don't close the pool while a request may still use it").not.toHaveBeenCalled();

    release();
    const res = await inFlight;
    expect(res.status).toBe(200);
    expect(res.body).toBe("slow done");

    const report = await shutdown;
    expect(report.forced).toBe(false);
    expect(report.hookErrors).toEqual([]);
    expect(poolClose).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["slow:start", "slow:end", "pool:close"]);
    expect(pool.ended, "pool.end() should have been awaited").toBe(true);
    expect(current.state).toBe("stopped");
  });

  it("tells keep-alive clients to close the connection after an in-flight response", async () => {
    const { handler, release, arrived } = controllableHandler();
    current = createServerLifecycle({ handler, port: 0, host: "127.0.0.1", drainTimeoutMs: 5_000 });
    const port = await current.start();
    const agent = new http.Agent({ keepAlive: true });

    const inFlight = get(port, "/slow", agent);
    await arrived;
    const shutdown = current.shutdown();
    release();

    const res = await inFlight;
    expect(res.headers.connection, "set `Connection: close` on responses finished while draining").toBe("close");
    const report = await shutdown;
    expect(report.forced, "the socket should be closed right after the response, not by the timeout").toBe(false);
    agent.destroy();
  });

  it("does not wait for idle keep-alive connections", async () => {
    const { handler } = controllableHandler();
    current = createServerLifecycle({ handler, port: 0, host: "127.0.0.1", drainTimeoutMs: 5_000 });
    const port = await current.start();
    const agent = new http.Agent({ keepAlive: true });
    await get(port, "/", agent); // leaves an idle, open socket in the agent

    const started = Date.now();
    const report = await current.shutdown();
    expect(report.forced).toBe(false);
    expect(Date.now() - started, "idle sockets should be closed immediately, not after the drain timeout").toBeLessThan(1_500);
    agent.destroy();
  });

  it("forces connections closed after drainTimeoutMs and still runs the hooks", async () => {
    const { handler, arrived } = controllableHandler();
    const hook = vi.fn();
    current = createServerLifecycle({
      handler,
      port: 0,
      host: "127.0.0.1",
      drainTimeoutMs: 200,
      onShutdown: [{ name: "cache", close: hook }],
    });
    const port = await current.start();

    const stuck = get(port, "/hang").then(
      () => "resolved",
      () => "rejected",
    );
    await arrived;

    const started = Date.now();
    const report = await current.shutdown();
    const took = Date.now() - started;

    expect(report.forced, "the hung request should trigger a forced close").toBe(true);
    expect(took, "shutdown must not wait (much) longer than drainTimeoutMs").toBeLessThan(1_500);
    expect(took).toBeGreaterThanOrEqual(150);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(await stuck, "the hung client's socket was destroyed").toBe("rejected");
  });

  it("runs every hook in order even when one fails, and reports the failure", async () => {
    const { handler } = controllableHandler();
    const order: string[] = [];
    current = createServerLifecycle({
      handler,
      port: 0,
      host: "127.0.0.1",
      drainTimeoutMs: 1_000,
      onShutdown: [
        { name: "first", close: () => void order.push("first") },
        {
          name: "broken",
          close: async () => {
            order.push("broken");
            throw new Error("redis already gone");
          },
        },
        { name: "last", close: async () => void order.push("last") },
      ],
    });
    await current.start();
    const report = await current.shutdown();
    expect(order).toEqual(["first", "broken", "last"]);
    expect(report.hookErrors.map((e) => e.name)).toEqual(["broken"]);
    expect(report.hookErrors[0]!.error).toBeInstanceOf(Error);
  });

  it("is idempotent: a second shutdown() returns the same promise and hooks run once", async () => {
    const { handler } = controllableHandler();
    const hook = vi.fn();
    current = createServerLifecycle({
      handler,
      port: 0,
      host: "127.0.0.1",
      drainTimeoutMs: 1_000,
      onShutdown: [{ name: "pool", close: hook }],
    });
    await current.start();
    const a = current.shutdown("SIGTERM");
    const b = current.shutdown("SIGINT");
    expect(b).toBe(a);
    await a;
    await current.shutdown();
    expect(hook).toHaveBeenCalledTimes(1);
  });
});
