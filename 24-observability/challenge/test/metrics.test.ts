import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp, checkoutBody, parseMetrics } from "./helpers.js";

async function durationSamples(app: Parameters<typeof request>[0]) {
  const res = await request(app).get("/metrics").expect(200);
  expect(res.headers["content-type"]).toMatch(/text\/plain/);
  return parseMetrics(res.text).filter((s) => s.name.startsWith("http_request_duration_seconds"));
}

describe("/metrics", () => {
  it("exposes http_request_duration_seconds with method, route and status_code labels", async () => {
    const { app } = buildTestApp();
    await request(app).get("/healthz");
    const counts = (await durationSamples(app)).filter((s) => s.name === "http_request_duration_seconds_count");
    expect(counts.length).toBeGreaterThan(0);
    expect(Object.keys(counts[0]!.labels).sort()).toEqual(["method", "route", "status_code"]);
  });

  it("counts checkouts by outcome", async () => {
    const { app } = buildTestApp();
    await request(app).post("/checkout").send(checkoutBody()).expect(201);
    const res = await request(app).get("/metrics");
    const success = parseMetrics(res.text).find((s) => s.name === "checkouts_total" && s.labels.outcome === "success");
    expect(success?.value).toBe(1);
  });
});

describe("finding 3: metric cardinality", () => {
  it("labels requests with the route TEMPLATE, so /orders/<id> is one series, not one per id", async () => {
    const { app } = buildTestApp();
    for (const id of ["9f1c", "a77b", "c0de", "f00d"]) await request(app).get(`/orders/${id}`).expect(404);

    const routes = new Set(
      (await durationSamples(app))
        .filter((s) => s.name === "http_request_duration_seconds_count" && s.labels.method === "GET")
        .map((s) => s.labels.route),
    );
    expect(routes.has("/orders/:id"), `routes seen: ${[...routes].join(", ")}`).toBe(true);
    for (const r of routes) expect(r, "a raw id ended up in a label value").not.toMatch(/9f1c|a77b|c0de|f00d/);
  });

  it("does not put raw paths of unmatched requests (scanners, typos) into labels", async () => {
    const { app } = buildTestApp();
    for (const p of ["/wp-admin.php", "/.env", "/admin/config.json", "/random-1234"]) await request(app).get(p).expect(404);

    const notFound = (await durationSamples(app)).filter(
      (s) => s.name === "http_request_duration_seconds_count" && s.labels.status_code === "404",
    );
    expect(notFound.map((s) => s.labels.route)).toEqual(["unmatched"]);
    expect(notFound[0]!.value).toBe(4);
  });

  it("drops the query string from route labels", async () => {
    const { app } = buildTestApp();
    await request(app).get("/healthz?probe=1");
    await request(app).get("/healthz?probe=2");
    const routes = (await durationSamples(app))
      .filter((s) => s.name === "http_request_duration_seconds_count")
      .map((s) => s.labels.route);
    expect(routes).toContain("/healthz");
    expect(routes.some((r) => r?.includes("?"))).toBe(false);
  });
});

describe("finding 4: latency units", () => {
  it("records durations in seconds (a ~60ms request lands near 0.06, not 60)", async () => {
    const { app } = buildTestApp({ delayMs: 60 });
    await request(app).post("/checkout").send(checkoutBody()).expect(201);

    const sum = (await durationSamples(app)).find(
      (s) => s.name === "http_request_duration_seconds_sum" && s.labels.method === "POST",
    );
    expect(sum, "no POST sample recorded").toBeDefined();
    expect(sum!.value).toBeGreaterThan(0.04);
    expect(sum!.value, `sum was ${sum!.value}: did you record milliseconds?`).toBeLessThan(2);
  });

  it("puts a ~60ms request in the 0.1s bucket but not the 0.05s one", async () => {
    const { app } = buildTestApp({ delayMs: 60 });
    await request(app).post("/checkout").send(checkoutBody()).expect(201);
    const buckets = (await durationSamples(app)).filter(
      (s) => s.name === "http_request_duration_seconds_bucket" && s.labels.method === "POST",
    );
    const le = (v: string) => buckets.find((b) => b.labels.le === v)?.value;
    expect(le("0.05")).toBe(0);
    expect(le("0.25")).toBe(1);
  });
});
