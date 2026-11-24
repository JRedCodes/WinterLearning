// Load test for the aggregator. Optional: needs k6 (https://k6.io/docs/get-started/installation/).
//
//   npm run dev                       # terminal 1 (simulated flaky downstreams)
//   k6 run k6/load.js                 # terminal 2
//   BASE_URL=http://localhost:8080 k6 run k6/load.js   # through nginx (deploy/nginx.conf)
//
// Things to try:
//   - REVIEWS_FAILURE_RATE=1 npm run dev     → reviews breaker opens, p95 stays low, degraded rate ~100%
//   - PRICING_LATENCY_MS=2000 npm run dev    → timeouts + bulkhead shed pricing, page still fast
//   - CATALOG_FAILURE_RATE=0.5 npm run dev   → 503s with Retry-After; watch the error rate threshold fail
//   - compare against the starter's naive service (git stash your work) to see cascading slowness
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const degraded = new Rate("degraded_responses");
const overviewLatency = new Trend("overview_latency", true);

export const options = {
  scenarios: {
    // Open model: a fixed ARRIVAL RATE regardless of how slow we are, like real users.
    // (A closed model with N looping VUs hides overload: slow responses reduce the load.)
    ramp: {
      executor: "ramping-arrival-rate",
      startRate: 20,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { target: 100, duration: "30s" },
        { target: 300, duration: "1m" },
        { target: 0, duration: "15s" },
      ],
    },
  },
  thresholds: {
    // The SLO, encoded: the run fails if we miss it.
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:overview}": ["p(95)<500", "p(99)<1000"],
    degraded_responses: ["rate<0.2"],
  },
};

export default function () {
  const id = `p-${Math.floor(Math.random() * 1000)}`;
  const res = http.get(`${BASE_URL}/products/${id}/overview`, { tags: { name: "overview" } });
  overviewLatency.add(res.timings.duration);
  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "has product": (r) => r.status !== 200 || r.json("data.product.id") === id,
  });
  if (ok) degraded.add(res.json("degraded") === true);
}
