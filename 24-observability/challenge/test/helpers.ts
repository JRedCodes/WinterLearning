import { Writable } from "node:stream";
import { Registry } from "prom-client";
import { createApp } from "../src/app.js";
import { createLogger } from "../src/lib/logger.js";
import { createMetrics } from "../src/lib/metrics.js";
import { createTracedFetch, type FetchLike } from "../src/lib/tracing.js";
import { PaymentsClient } from "../src/clients/paymentsClient.js";
import { InMemoryOrderRepository } from "../src/repositories/orderRepository.js";
import { CheckoutService } from "../src/services/checkoutService.js";
import type { ReadinessCheck } from "../src/routes/healthRoutes.js";

export type LogLine = Record<string, unknown> & { level: string; msg: string };

/** A pino destination that keeps every line in memory. */
export function captureLogs() {
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      raw.push(...String(chunk).split("\n").filter(Boolean));
      cb();
    },
  });
  return {
    stream,
    text: () => raw.join("\n"),
    lines: (): LogLine[] => raw.map((l) => JSON.parse(l) as LogLine),
    byMsg: (msg: string): LogLine[] => raw.map((l) => JSON.parse(l) as LogLine).filter((l) => l.msg === msg),
  };
}

export interface FakePaymentsOptions {
  /** Delay every authorization by this many ms. */
  delayMs?: number;
  /** "approve" (default), "decline", or "down" (connection refused). */
  mode?: "approve" | "decline" | "down";
}

/**
 * A fake of the *network*, not of PaymentsClient: the real client and the real
 * traced fetch run, so we can see exactly which headers would go over the wire.
 */
export function fakePaymentsFetch(options: FakePaymentsOptions = {}) {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetchImpl: FetchLike = async (url, init = {}) => {
    calls.push({
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.mode === "down") throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.4.12:443");
    if (url.endsWith("/health")) return new Response("ok", { status: 200 });
    if (options.mode === "decline") return new Response(null, { status: 402 });
    return Response.json({ authorizationId: `auth_${calls.length}` }, { status: 201 });
  };
  return { fetchImpl, calls };
}

export interface TestAppOptions extends FakePaymentsOptions {
  readinessChecks?: ReadinessCheck[];
  readinessTimeoutMs?: number;
  logLevel?: string;
}

/** Wires the app exactly like server.ts does, but with captured logs and a fake network. */
export function buildTestApp(options: TestAppOptions = {}) {
  const logs = captureLogs();
  const logger = createLogger({ level: options.logLevel ?? "debug", service: "checkout" }, logs.stream);
  const registry = new Registry();
  const metrics = createMetrics(registry);
  const network = fakePaymentsFetch(options);
  const payments = new PaymentsClient("http://payments.internal", createTracedFetch(network.fetchImpl));
  const checkout = new CheckoutService({ payments, orders: new InMemoryOrderRepository(), logger, metrics });
  const app = createApp({
    logger,
    registry,
    metrics,
    checkout,
    readinessChecks: options.readinessChecks ?? [{ name: "payments", check: () => payments.ping() }],
    readinessTimeoutMs: options.readinessTimeoutMs ?? 200,
  });
  return { app, logs, registry, network };
}

export const SECRET_CARD = "4242424242424242";
export const SECRET_CVC = "987";
export const SECRET_TOKEN = "Bearer sk_live_51HxTOPSECRETtoken";

export function checkoutBody(customerId = "cus_1") {
  return {
    customerId,
    items: [
      { sku: "MUG-01", quantity: 2, unitPriceCents: 1250 },
      { sku: "TEE-XL", quantity: 1, unitPriceCents: 2000 },
    ],
    payment: { cardNumber: SECRET_CARD, cvc: SECRET_CVC },
  };
}

/** Parses Prometheus text format into samples. Enough for tests; not a full parser. */
export function parseMetrics(text: string) {
  const samples: { name: string; labels: Record<string, string>; value: number }[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)$/.exec(line);
    if (!m) continue;
    const labels: Record<string, string> = {};
    for (const pair of (m[2] ?? "").matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) labels[pair[1]!] = pair[2]!;
    samples.push({ name: m[1]!, labels, value: Number(m[3]) });
  }
  return samples;
}
