import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export interface HttpMetrics {
  /** Request latency in SECONDS (Prometheus base unit), labelled by method, route template and status code. */
  httpRequestDuration: Histogram<"method" | "route" | "status_code">;
  /** Business metric: checkouts by outcome (success | declined | error). */
  checkoutsTotal: Counter<"outcome">;
}

/**
 * Registers the app's metrics on the given registry.
 * Each app instance gets its own Registry (tests build many apps; the global
 * default registry would complain about duplicate metric names).
 */
export function createMetrics(registry: Registry, options: { defaultMetrics?: boolean } = {}): HttpMetrics {
  if (options.defaultMetrics) {
    // process_cpu_seconds_total, nodejs_eventloop_lag_seconds, heap sizes, ...
    collectDefaultMetrics({ register: registry });
  }

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const checkoutsTotal = new Counter({
    name: "checkouts_total",
    help: "Checkout attempts by outcome",
    labelNames: ["outcome"] as const,
    registers: [registry],
  });

  return { httpRequestDuration, checkoutsTotal };
}
