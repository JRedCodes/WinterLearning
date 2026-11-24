# Deep dive: Prometheus metrics and PromQL

You don't need to be a PromQL expert to be a good backend engineer, but you need to be able to read the queries on your team's dashboards and write the common ones.

## Counters and `rate()`

A counter's raw value ("18,710 checkouts since the pod started") is almost never what you want. It resets on every restart and differs per pod. You want the **per-second rate** over a window:

```promql
rate(checkouts_total{outcome="success"}[5m])
```

`rate` handles counter resets for you. Sum across pods, keeping only the labels you care about:

```promql
sum by (outcome) (rate(checkouts_total[5m]))
```

Error ratio for a route (RED "E"):

```promql
sum(rate(http_request_duration_seconds_count{route="/checkout", status_code=~"5.."}[5m]))
/
sum(rate(http_request_duration_seconds_count{route="/checkout"}[5m]))
```

Note that a histogram's `_count` series is a counter of requests, so you get request rate for free and don't need a separate `http_requests_total`.

## Histograms and `histogram_quantile()`

The `_bucket` series are cumulative counters: `le="0.25"` counts all requests that took ≤ 0.25 s. To get p99 across all pods:

```promql
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/checkout"}[5m]))
)
```

The `sum by (le)` is essential: it adds the buckets from all instances (and all status codes) before estimating. Keep `route` in the `by` clause to get one line per route.

Prometheus estimates the quantile by **linear interpolation inside a bucket**, so precision depends on bucket boundaries. If your buckets are `0.5, 1` and the true p99 is 0.6 s, Prometheus can only tell you it's somewhere between them. Put boundaries near the thresholds you care about (your SLO).

Average latency, when you want it, is `rate(_sum) / rate(_count)`.

## Gauges

```promql
max by (dependency) (upstream_inflight_requests)
max_over_time(upstream_queued_requests[10m]) > 0
```

## Recording rules and alerts (preview)

Expensive queries used by dashboards and alerts are precomputed with **recording rules**, and alerts are rules evaluated every interval:

```yaml
groups:
  - name: checkout
    rules:
      - record: route:http_errors:ratio_rate5m
        expr: |
          sum by (route) (rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
          / sum by (route) (rate(http_request_duration_seconds_count[5m]))
      - alert: CheckoutHighErrorRate
        expr: route:http_errors:ratio_rate5m{route="/checkout"} > 0.02
        for: 5m
        labels: { severity: page }
        annotations:
          summary: "Checkout 5xx ratio above 2% for 5 minutes"
          runbook: "https://wiki.example.internal/runbooks/checkout-errors"
```

`for: 5m` means the condition must hold for five minutes before firing, which filters out blips. Every paging alert should link a runbook.

## Burn-rate alerting in one paragraph

With a 99.9% SLO, the allowed error ratio is 0.001. Burn rate = observed error ratio / allowed ratio. A burn rate of 14.4 sustained for 1 hour uses 2% of a 30-day budget. The Google SRE workbook recommends paging when **both** a long window (1 h) and a short window (5 m) exceed 14.4. The long window proves it's significant; the short window proves it's still happening, so the alert resolves quickly after a fix. A slower tier (burn rate 6 over 6 h and 30 m) catches smouldering problems.

```promql
(
  route:http_errors:ratio_rate1h{route="/checkout"} > (14.4 * 0.001)
and
  route:http_errors:ratio_rate5m{route="/checkout"} > (14.4 * 0.001)
)
```

## Cardinality: measuring it

On a running Prometheus, find your worst offenders:

```promql
topk(10, count by (__name__) ({__name__=~".+"}))
```

or for one metric, count distinct label values:

```promql
count(count by (route) (http_request_duration_seconds_count))
```

If that number keeps growing over time, something unbounded is in a label.

## Default Node metrics

`collectDefaultMetrics({ register })` adds process and runtime metrics. The most useful ones:

| Metric | Why you care |
|---|---|
| `nodejs_eventloop_lag_seconds` | high lag = CPU-bound code is blocking the loop (module 01). Low lag + high latency = you're *waiting* on something |
| `process_resident_memory_bytes` | leaks show as a steady climb until OOM-kill |
| `nodejs_heap_size_used_bytes` | same, from V8's point of view |
| `process_cpu_seconds_total` | `rate()` of it = CPU cores in use |
| `nodejs_active_handles_total` | sockets/timers; a climb can mean leaked connections |

In the challenge's incident, event-loop lag was *normal* during the outage. That's a strong clue: the process wasn't busy, it was waiting.
