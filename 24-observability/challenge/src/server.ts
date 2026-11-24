import { Registry } from "prom-client";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { createLogger } from "./lib/logger.js";
import { createMetrics } from "./lib/metrics.js";
import { createTracedFetch } from "./lib/tracing.js";
import { PaymentsClient } from "./clients/paymentsClient.js";
import { InMemoryOrderRepository } from "./repositories/orderRepository.js";
import { CheckoutService } from "./services/checkoutService.js";

// Composition root: the only file that knows about real implementations.
const config = loadConfig();
const logger = createLogger({ level: config.logLevel, service: config.serviceName });
const registry = new Registry();
const metrics = createMetrics(registry, { defaultMetrics: true });

const payments = new PaymentsClient(config.paymentsUrl, createTracedFetch(fetch));
const checkout = new CheckoutService({ payments, orders: new InMemoryOrderRepository(), logger, metrics });

const app = createApp({
  logger,
  registry,
  metrics,
  checkout,
  readinessChecks: [{ name: "payments", check: () => payments.ping() }],
  readinessTimeoutMs: config.readinessTimeoutMs,
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "checkout api listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  });
}
