import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ALICE, BOB, NOW, WENDY, buildTestApp } from "./helpers.js";

type TestApp = ReturnType<typeof buildTestApp>;

const twoMugs = { country: "DE", lines: [{ sku: "MUG-0001", quantity: 2 }] };

async function placeOrder(t: TestApp, user = ALICE, body: object = twoMugs) {
  const res = await request(t.app).post("/orders").set("X-User-Id", user).send(body);
  expect(res.status, `POST /orders failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; status: string };
}

async function act(t: TestApp, user: string, orderId: string, action: string) {
  return request(t.app).post(`/orders/${orderId}/${action}`).set("X-User-Id", user);
}

/** pending -> paid -> packed, using the API like a real client would. */
async function packedOrder(t: TestApp) {
  const order = await placeOrder(t);
  expect((await act(t, ALICE, order.id, "pay")).status).toBe(200);
  const packed = await act(t, WENDY, order.id, "pack");
  expect(packed.status, `pack failed: ${JSON.stringify(packed.body)}`).toBe(200);
  return order;
}

describe("order fulfilment API", () => {
  let t: TestApp;
  beforeEach(() => {
    t = buildTestApp();
  });

  describe("authentication", () => {
    it("rejects requests without X-User-Id with 401", async () => {
      const res = await request(t.app).get("/orders");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects an unknown user with 401 instead of crashing (bug: undefined from a lookup)", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await request(t.app).get("/orders").set("X-User-Id", "u_mallory");
      spy.mockRestore();
      expect(res.status, `expected 401, got ${res.status} ${JSON.stringify(res.body)}`).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("only lets warehouse staff pack orders (403 for customers)", async () => {
      const order = await placeOrder(t);
      await act(t, ALICE, order.id, "pay");
      const res = await act(t, ALICE, order.id, "pack");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /orders", () => {
    it("creates a pending order priced in integer cents (bug: money as string)", async () => {
      const res = await request(t.app).post("/orders").set("X-User-Id", ALICE).send(twoMugs);
      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/orders/${res.body.data.id}`);
      expect(res.body.data).toMatchObject({
        status: "pending",
        userId: ALICE,
        country: "DE",
        subtotalCents: 2598,
        createdAt: NOW.toISOString(),
      });
      expect(res.body.data.shippingCents, "shippingCents must be a number of cents").toBe(499);
      expect(res.body.data.totalCents, "totalCents must be subtotal + shipping, as a number").toBe(3097);
    });

    it("asks the carrier for a quote using the total weight", async () => {
      await request(t.app)
        .post("/orders")
        .set("X-User-Id", ALICE)
        .send({ country: "FR", lines: [{ sku: "MUG-0001", quantity: 2 }, { sku: "TEE-0002", quantity: 1 }] });
      expect(t.carrier.calls).toEqual([
        { path: "/v2/quotes", body: { destination_country: "FR", weight_grams: 900 } },
      ]);
    });

    it("normalizes SKUs before looking them up", async () => {
      const res = await request(t.app)
        .post("/orders")
        .set("X-User-Id", ALICE)
        .send({ country: "DE", lines: [{ sku: " mug-0001 ", quantity: 1 }] });
      expect(res.status).toBe(201);
      expect(res.body.data.lines[0]).toMatchObject({ sku: "MUG-0001", quantity: 1, unitPriceCents: 1299 });
    });

    it.each([
      ["no lines", { country: "DE", lines: [] }],
      ["missing country", { lines: [{ sku: "MUG-0001", quantity: 1 }] }],
      ["lower-case country", { country: "de", lines: [{ sku: "MUG-0001", quantity: 1 }] }],
      ["zero quantity", { country: "DE", lines: [{ sku: "MUG-0001", quantity: 0 }] }],
      ["fractional quantity", { country: "DE", lines: [{ sku: "MUG-0001", quantity: 1.5 }] }],
      ["quantity as a string", { country: "DE", lines: [{ sku: "MUG-0001", quantity: "2" }] }],
      ["malformed SKU", { country: "DE", lines: [{ sku: "MUG-1", quantity: 1 }] }],
    ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body) => {
      const res = await request(t.app).post("/orders").set("X-User-Id", ALICE).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a well-formed but unknown SKU with 422 UNKNOWN_SKU", async () => {
      const res = await request(t.app)
        .post("/orders")
        .set("X-User-Id", ALICE)
        .send({ country: "DE", lines: [{ sku: "HAT-0009", quantity: 1 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("UNKNOWN_SKU");
    });

    it("returns 502 CARRIER_BAD_RESPONSE when the quote response is malformed", async () => {
      t.carrier.responses["/v2/quotes"] = { service: "standard", price: 4.99 };
      const res = await request(t.app).post("/orders").set("X-User-Id", ALICE).send(twoMugs);
      expect(res.status, JSON.stringify(res.body)).toBe(502);
      expect(res.body.error.code).toBe("CARRIER_BAD_RESPONSE");
    });
  });

  describe("reading orders", () => {
    it("lists only the caller's orders", async () => {
      await placeOrder(t, ALICE);
      await placeOrder(t, BOB);
      const res = await request(t.app).get("/orders").set("X-User-Id", BOB);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userId).toBe(BOB);
    });

    it("returns your own order and hides other people's orders behind a 404", async () => {
      const order = await placeOrder(t, ALICE);
      const mine = await request(t.app).get(`/orders/${order.id}`).set("X-User-Id", ALICE);
      expect(mine.status).toBe(200);
      expect(mine.body.data.id).toBe(order.id);
      const theirs = await request(t.app).get(`/orders/${order.id}`).set("X-User-Id", BOB);
      expect(theirs.status).toBe(404);
      expect(theirs.body.error.code).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("status transitions", () => {
    it("pays a pending order once; paying again is 409 INVALID_TRANSITION", async () => {
      const order = await placeOrder(t);
      const paid = await act(t, ALICE, order.id, "pay");
      expect(paid.status).toBe(200);
      expect(paid.body.data).toMatchObject({ status: "paid", paidAt: NOW.toISOString() });
      const again = await act(t, ALICE, order.id, "pay");
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("INVALID_TRANSITION");
    });

    it("refuses to pack an unpaid order", async () => {
      const order = await placeOrder(t);
      const res = await act(t, WENDY, order.id, "pack");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_TRANSITION");
    });
  });

  describe("cancelling", () => {
    it("lets a customer cancel their own pending order (bug: swapped arguments)", async () => {
      const order = await placeOrder(t);
      const res = await act(t, ALICE, order.id, "cancel");
      expect(res.status, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.data).toMatchObject({ id: order.id, status: "cancelled", cancelledAt: NOW.toISOString() });
    });

    it("lets a customer cancel a paid order", async () => {
      const order = await placeOrder(t);
      await act(t, ALICE, order.id, "pay");
      const res = await act(t, ALICE, order.id, "cancel");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
    });

    it("refuses to cancel an order the warehouse has packed (bug: unhandled status)", async () => {
      const order = await packedOrder(t);
      const res = await act(t, ALICE, order.id, "cancel");
      expect(res.status, `expected 409, got ${res.status} ${JSON.stringify(res.body)}`).toBe(409);
      expect(res.body.error.code).toBe("ORDER_NOT_CANCELLABLE");
    });

    it("does not let one customer cancel another customer's order", async () => {
      const order = await placeOrder(t, ALICE);
      const res = await act(t, BOB, order.id, "cancel");
      expect(res.status).toBe(404);
    });
  });

  describe("shipping", () => {
    it("ships a packed order with the carrier's tracking number (bug: wrong field name)", async () => {
      const order = await packedOrder(t);
      const res = await act(t, WENDY, order.id, "ship");
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: "shipped",
        carrier: "ups",
        trackingNumber: "1Z999AA10123456784",
        shippedAt: NOW.toISOString(),
      });
      expect(t.carrier.calls.at(-1)).toEqual({
        path: "/v2/shipments",
        body: { reference: order.id, destination_country: "DE", weight_grams: 700 },
      });
    });

    it("returns 502 CARRIER_BAD_RESPONSE for a malformed shipment response and leaves the order packed", async () => {
      const order = await packedOrder(t);
      t.carrier.responses["/v2/shipments"] = { carrier: "ups", eta_days: 3 };
      const res = await act(t, WENDY, order.id, "ship");
      expect(res.status, JSON.stringify(res.body)).toBe(502);
      expect(res.body.error.code).toBe("CARRIER_BAD_RESPONSE");
      const after = await request(t.app).get(`/orders/${order.id}`).set("X-User-Id", ALICE);
      expect(after.body.data.status).toBe("packed");
    });
  });

  describe("errors", () => {
    afterEach(() => vi.restoreAllMocks());

    it("turns malformed JSON into 400 INVALID_JSON", async () => {
      const res = await request(t.app)
        .post("/orders")
        .set("X-User-Id", ALICE)
        .set("Content-Type", "application/json")
        .send('{"country": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_JSON");
    });

    it("includes the request id in error bodies", async () => {
      const res = await request(t.app).get("/orders/nope").set("X-User-Id", ALICE).set("X-Request-Id", "trace-08");
      expect(res.status).toBe(404);
      expect(res.body.error.requestId).toBe("trace-08");
    });
  });
});
