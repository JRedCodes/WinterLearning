import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installSignalHandlers, type ShutdownReport, type SignalTarget } from "../src/lib/lifecycle.js";

/** A fake `process`: emit("SIGTERM") to simulate `docker stop`. */
function fakeProcess() {
  const emitter = new EventEmitter();
  const exit = vi.fn<(code: number) => void>();
  const target: SignalTarget & { emit: (s: string) => boolean } = {
    on: (signal, listener) => emitter.on(signal, listener),
    exit,
    emit: (s) => emitter.emit(s),
  };
  return { target, exit };
}

const report = (overrides: Partial<ShutdownReport> = {}): ShutdownReport => ({
  forced: false,
  durationMs: 5,
  hookErrors: [],
  ...overrides,
});

const flush = () => new Promise((r) => setImmediate(r));

describe("installSignalHandlers (TODO 6)", () => {
  it.each(["SIGTERM", "SIGINT"] as const)("on %s: shuts down, then exits 0", async (signal) => {
    const { target, exit } = fakeProcess();
    const shutdown = vi.fn(async () => report());
    installSignalHandlers({ shutdown }, target);

    target.emit(signal);
    expect(shutdown).toHaveBeenCalledWith(signal);
    expect(exit, "don't exit before shutdown has finished").not.toHaveBeenCalled();
    await flush();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 when the drain had to be forced or a hook failed", async () => {
    for (const r of [report({ forced: true }), report({ hookErrors: [{ name: "pg", error: new Error("x") }] })]) {
      const { target, exit } = fakeProcess();
      installSignalHandlers({ shutdown: async () => r }, target);
      target.emit("SIGTERM");
      await flush();
      expect(exit).toHaveBeenCalledWith(1);
    }
  });

  it("exits 1 if shutdown itself rejects", async () => {
    const { target, exit } = fakeProcess();
    installSignalHandlers({ shutdown: async () => Promise.reject(new Error("boom")) }, target);
    target.emit("SIGTERM");
    await flush();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("a second signal during shutdown exits 1 immediately (no second shutdown)", async () => {
    const { target, exit } = fakeProcess();
    let finish!: () => void;
    const shutdown = vi.fn(() => new Promise<ShutdownReport>((r) => (finish = () => r(report()))));
    installSignalHandlers({ shutdown }, target);

    target.emit("SIGTERM");
    target.emit("SIGINT");
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    finish();
    await flush();
  });
});
