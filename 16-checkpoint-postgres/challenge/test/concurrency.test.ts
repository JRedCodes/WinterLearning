import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  availableStock,
  countStatuses,
  createProduct,
  createWarehouse,
  placeOrder,
  setStock,
  startHarness,
  type Harness,
} from "./helpers/harness.js";

describe("concurrency", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  async function reservedUnits(productId: number): Promise<number> {
    const [row] = await h.sql<{ n: string }>(
      `SELECT COALESCE(SUM(l.quantity), 0) AS n
         FROM order_lines l JOIN orders o ON o.id = l.order_id
        WHERE l.product_id = $1 AND o.status = 'reserved'`,
      [productId],
    );
    return Number(row!.n);
  }

  it("30 concurrent orders for 10 units never oversell", async () => {
    const wh = await createWarehouse(h);
    const p = await createProduct(h);
    await setStock(h, wh.id, p.id, 10);

    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) => placeOrder(h, wh.id, [{ productId: p.id, quantity: 1 }], `c${i}`)),
    );

    expect(countStatuses(responses)).toEqual({ 201: 10, 409: 20 });
    expect(await availableStock(h, wh.id, p.id)).toBe(0);
    expect(await reservedUnits(p.id)).toBe(10);
  });

  it("multi-line orders with lines in opposite order don't deadlock and stay all-or-nothing", async () => {
    const wh = await createWarehouse(h);
    const a = await createProduct(h);
    const b = await createProduct(h);
    await setStock(h, wh.id, a.id, 10);
    await setStock(h, wh.id, b.id, 10);

    const responses = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        placeOrder(
          h,
          wh.id,
          i % 2 === 0
            ? [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }]
            : [{ productId: b.id, quantity: 1 }, { productId: a.id, quantity: 1 }],
        ),
      ),
    );

    expect(countStatuses(responses), "no 500s (deadlocks)").toEqual({ 201: 10, 409: 14 });
    expect(await availableStock(h, wh.id, a.id)).toBe(0);
    expect(await availableStock(h, wh.id, b.id)).toBe(0);
    expect(await reservedUnits(a.id)).toBe(10);
    expect(await reservedUnits(b.id)).toBe(10);
  });

  it("10 concurrent cancels of one order release its stock exactly once", async () => {
    const wh = await createWarehouse(h);
    const p = await createProduct(h);
    await setStock(h, wh.id, p.id, 10);
    const order = await placeOrder(h, wh.id, [{ productId: p.id, quantity: 4 }]);
    expect(order.status).toBe(201);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => h.api().post(`/orders/${order.body.data.id}/cancel`)),
    );

    expect(countStatuses(responses)).toEqual({ 200: 1, 409: 9 });
    expect(await availableStock(h, wh.id, p.id)).toBe(10);
  });

  it("orders and cancels interleaving keep stock = initial - reserved", async () => {
    const wh = await createWarehouse(h);
    const p = await createProduct(h);
    await setStock(h, wh.id, p.id, 20);
    const first = await Promise.all(
      Array.from({ length: 10 }, () => placeOrder(h, wh.id, [{ productId: p.id, quantity: 2 }])),
    );
    const ids = first.filter((r) => r.status === 201).map((r) => r.body.data.id as number);

    await Promise.all([
      ...ids.slice(0, 5).map((id) => h.api().post(`/orders/${id}/cancel`)),
      ...Array.from({ length: 10 }, () => placeOrder(h, wh.id, [{ productId: p.id, quantity: 1 }])),
    ]);

    const available = await availableStock(h, wh.id, p.id);
    expect(available).toBeGreaterThanOrEqual(0);
    expect(available + (await reservedUnits(p.id)), "available + reserved must equal the 20 we started with").toBe(20);
  });
});
