# Cheat sheet · Observability

## pino

```ts
import { pino } from "pino";
const logger = pino({
  level: "info",
  base: { service: "checkout", version: "1.4.2" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: ["headers.authorization", "headers.cookie", "*.password"], censor: "[Redacted]" },
});
logger.info({ orderId }, "order created");      // fields first, constant message second
logger.error({ err }, "request failed");         // `err` key → type, message, stack
const child = logger.child({ requestId });       // bind fields
logger.isLevelEnabled("debug");                  // guard expensive debug logs
```

Dev: `npm run dev | npx pino-pretty`

## AsyncLocalStorage

```ts
import { AsyncLocalStorage } from "node:async_hooks";
const als = new AsyncLocalStorage<Ctx>();
als.run(ctx, next);          // in middleware; downstream async work sees ctx
als.getStore();              // anywhere deeper; undefined outside a run()
```

## prom-client

```ts
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const c = new Counter({ name: "jobs_total", help: "…", labelNames: ["outcome"] as const, registers: [registry] });
const g = new Gauge({ name: "queue_depth", help: "…", registers: [registry] });
const h = new Histogram({ name: "x_duration_seconds", help: "…", labelNames: ["route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5], registers: [registry] });
c.inc({ outcome: "ok" }); g.set(12); h.observe({ route: "/a" }, 0.042);
const end = h.startTimer({ route: "/a" }); /* … */ end();   // observes seconds for you
res.set("Content-Type", registry.contentType).send(await registry.metrics());
```

Express route template for labels: `req.route ? req.baseUrl + req.route.path : "unmatched"` (read it on `finish`).

## Naming

`<namespace>_<what>_<unit>`, base units, `_total` for counters: `http_request_duration_seconds`, `payments_requests_total`, `process_resident_memory_bytes`.

## PromQL

| Want | Query |
|---|---|
| Request rate per route | `sum by (route) (rate(http_request_duration_seconds_count[5m]))` |
| 5xx ratio | `sum(rate(…_count{status_code=~"5.."}[5m])) / sum(rate(…_count[5m]))` |
| p99 latency | `histogram_quantile(0.99, sum by (le) (rate(…_bucket[5m])))` |
| p99 per route | `histogram_quantile(0.99, sum by (le, route) (rate(…_bucket[5m])))` |
| Average latency | `rate(…_sum[5m]) / rate(…_count[5m])` |
| Series per metric | `topk(10, count by (__name__) ({__name__=~".+"}))` |

## Health probes

| | `/healthz` (liveness) | `/readyz` (readiness) |
|---|---|---|
| Checks | process only | required dependencies, with timeouts |
| Failure → | restart | removed from load balancer |
| Body | `{ "status": "ok" }` | `{ "status", "checks": { name: { ok, error? } } }` |

## traceparent

`00-<32 hex trace id>-<16 hex parent span id>-<01 sampled | 00>`
Incoming valid → keep trace id + flag, new span id. Outgoing → child span id per call. Invalid/missing → new trace.

## SLO arithmetic

| SLO | Budget / 30 days |
|---|---|
| 99% | 7h 12m |
| 99.5% | 3h 36m |
| 99.9% | 43m |
| 99.95% | 21m |
| 99.99% | 4m 19s |

Burn rate = error ratio / (1 − SLO). Page on 14.4× over 1h **and** 5m; ticket on slower burns.

## Postmortem headings

Summary · Impact · Timeline · Root cause · Detection · Resolution · Action items · Lessons learned. Blameless, evidence-based, mechanism over trigger.
