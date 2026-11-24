import { describe, expect, it } from "vitest";
import request from "supertest";
import { continueTrace, formatTraceparent, parseTraceparent } from "../src/lib/tracing.js";
import { buildTestApp, checkoutBody } from "./helpers.js";

const INCOMING = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/;

describe("traceparent helpers (already correct, read them)", () => {
  it("parses a valid header and rejects junk", () => {
    expect(parseTraceparent(INCOMING)).toEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      sampled: true,
    });
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeUndefined();
    expect(parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeUndefined();
    expect(parseTraceparent("hello")).toBeUndefined();
  });

  it("continueTrace keeps the trace id but mints a new span id", () => {
    const ctx = continueTrace(INCOMING);
    expect(ctx.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx.spanId).not.toBe("00f067aa0ba902b7");
    expect(formatTraceparent(ctx)).toMatch(TRACEPARENT);
  });
});

describe("finding 6: traces break at service boundaries", () => {
  it("joins the caller's trace: logs use the incoming trace id", async () => {
    const { app, logs } = buildTestApp();
    await request(app).get("/healthz").set("traceparent", INCOMING);
    expect(logs.byMsg("request completed")[0]!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("sends traceparent to payments: same trace id, a new parent (span) id", async () => {
    const { app, network } = buildTestApp();
    await request(app).post("/checkout").set("traceparent", INCOMING).send(checkoutBody()).expect(201);

    const call = network.calls.find((c) => c.url.endsWith("/authorizations"));
    expect(call, "payments was never called").toBeDefined();
    const sent = call!.headers.get("traceparent");
    expect(sent, "no traceparent header on the outgoing call").toMatch(TRACEPARENT);
    const parsed = parseTraceparent(sent!)!;
    expect(parsed.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(parsed.spanId).not.toBe("00f067aa0ba902b7");
    expect(parsed.sampled).toBe(true);
  });

  it("starts a new trace when there is no incoming header, and the outgoing call belongs to it", async () => {
    const { app, network, logs } = buildTestApp();
    await request(app).post("/checkout").set("X-Request-Id", "req-new-trace").send(checkoutBody()).expect(201);

    const call = network.calls.find((c) => c.url.endsWith("/authorizations"))!;
    const sent = parseTraceparent(call.headers.get("traceparent") ?? undefined);
    expect(sent, "no valid traceparent on the outgoing call").toBeDefined();
    expect(sent!.traceId).toBe(logs.byMsg("request completed")[0]!.traceId);
    expect(call.headers.get("x-request-id")).toBe("req-new-trace");
  });

  it("ignores a malformed incoming traceparent instead of propagating garbage", async () => {
    const { app, network } = buildTestApp();
    await request(app).post("/checkout").set("traceparent", "00-not-a-real-header-01").send(checkoutBody()).expect(201);
    const call = network.calls.find((c) => c.url.endsWith("/authorizations"))!;
    expect(call.headers.get("traceparent")).toMatch(TRACEPARENT);
  });
});
