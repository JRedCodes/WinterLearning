import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp, checkoutBody, SECRET_CARD, SECRET_CVC, SECRET_TOKEN } from "./helpers.js";

describe("access log", () => {
  it("writes exactly one 'request completed' line per request, tagged with the request id", async () => {
    const { app, logs } = buildTestApp();
    const res = await request(app).get("/healthz");
    const lines = logs.byMsg("request completed");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      requestId: res.headers["x-request-id"],
      method: "GET",
      statusCode: 200,
      service: "checkout",
    });
    expect(typeof lines[0]!.durationMs).toBe("number");
  });
});

describe("finding 2: request-scoped logging", () => {
  it("service-level log lines carry the same requestId as the access log", async () => {
    const { app, logs } = buildTestApp();
    await request(app).post("/checkout").set("X-Request-Id", "req-abc-123").send(checkoutBody()).expect(201);

    const authorized = logs.byMsg("payment authorized");
    expect(authorized, "expected the service to log 'payment authorized'").toHaveLength(1);
    expect(
      authorized[0]!.requestId,
      "'payment authorized' has no requestId: the service is not seeing the request-scoped logger",
    ).toBe("req-abc-123");
    expect(authorized[0]!.traceId).toBe(logs.byMsg("request completed")[0]!.traceId);
  });

  it("never mixes up request ids between concurrent requests", async () => {
    const { app, logs } = buildTestApp({ delayMs: 15 });
    const ids = Array.from({ length: 12 }, (_, i) => `req-${i}`);
    await Promise.all(
      ids.map((id) => request(app).post("/checkout").set("X-Request-Id", id).send(checkoutBody(`cus-for-${id}`))),
    );
    const authorized = logs.byMsg("payment authorized");
    expect(authorized).toHaveLength(ids.length);
    for (const line of authorized) {
      expect(line.customerId).toBe(`cus-for-${String(line.requestId)}`);
    }
  });

  it("logs 5xx errors once, at error level, with the request id and the error's stack", async () => {
    const { app, logs } = buildTestApp({ mode: "down" });
    const res = await request(app).post("/checkout").set("X-Request-Id", "req-down").send(checkoutBody());
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");

    const failed = logs.byMsg("request failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ level: "error", requestId: "req-down" });
    const err = failed[0]!.err as { type?: string; stack?: string };
    expect(err.type).toBe("DependencyUnavailableError");
    expect(err.stack).toContain("DependencyUnavailableError");
  });
});

describe("finding 1: secrets in logs", () => {
  it("never writes card numbers, CVCs or Authorization headers to the logs", async () => {
    const { app, logs } = buildTestApp({ logLevel: "trace" });
    await request(app)
      .post("/checkout")
      .set("Authorization", SECRET_TOKEN)
      .set("Cookie", "session=s3ss10n-cookie-value")
      .send(checkoutBody())
      .expect(201);

    const text = logs.text();
    expect(text, "card number leaked into logs").not.toContain(SECRET_CARD);
    expect(text, "CVC leaked into logs").not.toMatch(new RegExp(`"cvc":"${SECRET_CVC}"`));
    expect(text, "Authorization header leaked into logs").not.toContain("sk_live_51HxTOPSECRETtoken");
    expect(text, "session cookie leaked into logs").not.toContain("s3ss10n-cookie-value");
  });

  it("redacts (keeps the field, hides the value) instead of dropping the log lines", async () => {
    const { app, logs } = buildTestApp({ logLevel: "trace" });
    await request(app).post("/checkout").set("Authorization", SECRET_TOKEN).send(checkoutBody()).expect(201);

    const received = logs.byMsg("request received");
    expect(received, "keep the debug 'request received' line").toHaveLength(1);
    expect((received[0]!.headers as Record<string, unknown>).authorization).toBe("[Redacted]");

    const authorizing = logs.byMsg("authorizing payment");
    expect(authorizing, "keep the debug 'authorizing payment' line").toHaveLength(1);
    expect(authorizing[0]!.payment).toEqual({ cardNumber: "[Redacted]", cvc: "[Redacted]" });
  });
});
