import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProduct, createWarehouse, placeOrder, setStock, startHarness, type Harness } from "./helpers/harness.js";

interface OrderSummary {
  id: number;
  customerId: string;
  status: string;
}

describe("GET /orders (keyset pagination + filters)", () => {
  let h: Harness;
  let wh: { id: number };
  let product: { id: number };

  beforeEach(async () => {
    h = await startHarness();
    wh = await createWarehouse(h);
    product = await createProduct(h);
    await setStock(h, wh.id, product.id, 1000);
  });
  afterEach(async () => {
    await h.close();
  });

  async function order(customerId: string): Promise<number> {
    const res = await placeOrder(h, wh.id, [{ productId: product.id, quantity: 1 }], customerId);
    if (res.status !== 201) throw new Error(`order failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.id;
  }

  async function page(query: Record<string, string | number>) {
    const res = await h.api().get("/orders").query(query);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as { data: OrderSummary[]; nextCursor: string | null };
  }

  it("pages through all orders newest first with no gaps or duplicates", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 25; i++) ids.push(await order("alice"));

    const p1 = await page({ limit: 10 });
    expect(p1.data).toHaveLength(10);
    expect(typeof p1.nextCursor).toBe("string");
    const p2 = await page({ limit: 10, cursor: p1.nextCursor! });
    const p3 = await page({ limit: 10, cursor: p2.nextCursor! });
    expect(p3.data).toHaveLength(5);
    expect(p3.nextCursor, "last page has no cursor").toBeNull();

    const seen = [...p1.data, ...p2.data, ...p3.data].map((o) => o.id);
    expect(seen).toEqual([...ids].reverse());
  });

  it("returns nextCursor = null when everything fits, and defaults limit to 20", async () => {
    for (let i = 0; i < 3; i++) await order("alice");
    const p = await page({});
    expect(p.data).toHaveLength(3);
    expect(p.nextCursor).toBeNull();
    for (let i = 0; i < 20; i++) await order("alice");
    expect((await page({})).data).toHaveLength(20);
  });

  it("list items are summaries without lines", async () => {
    await order("alice");
    const p = await page({});
    expect(p.data[0]).toMatchObject({ customerId: "alice", status: "reserved", warehouseId: wh.id });
    expect(p.data[0]).not.toHaveProperty("lines");
  });

  it("is stable while new orders arrive (that's why we use keyset, not OFFSET)", async () => {
    for (let i = 0; i < 6; i++) await order("alice");
    const p1 = await page({ limit: 3 });
    // Two new orders land between page requests.
    await order("alice");
    await order("alice");
    const p2 = await page({ limit: 3, cursor: p1.nextCursor! });
    const overlap = p2.data.filter((o) => p1.data.some((x) => x.id === o.id));
    expect(overlap, "page 2 must not repeat page 1").toEqual([]);
    expect(p2.data.every((o) => o.id < p1.data[2]!.id)).toBe(true);
  });

  it("filters by customerId and status, and paginates within the filter", async () => {
    const aliceIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      aliceIds.push(await order("alice"));
      await order("bob");
    }
    await h.api().post(`/orders/${aliceIds[1]}/cancel`);
    await h.api().post(`/orders/${aliceIds[3]}/cancel`);

    const alice = await page({ customerId: "alice" });
    expect(alice.data.map((o) => o.id)).toEqual([...aliceIds].reverse());

    const cancelled = await page({ customerId: "alice", status: "cancelled" });
    expect(cancelled.data.map((o) => o.id)).toEqual([aliceIds[3], aliceIds[1]]);

    const reservedP1 = await page({ customerId: "alice", status: "reserved", limit: 2 });
    const reservedP2 = await page({ customerId: "alice", status: "reserved", limit: 2, cursor: reservedP1.nextCursor! });
    expect([...reservedP1.data, ...reservedP2.data].map((o) => o.id)).toEqual([aliceIds[4], aliceIds[2], aliceIds[0]]);
    expect(reservedP2.nextCursor).toBeNull();
  });

  it("rejects bad query params with 400", async () => {
    expect((await h.api().get("/orders").query({ cursor: "not-a-cursor" })).status).toBe(400);
    expect((await h.api().get("/orders").query({ limit: 0 })).status).toBe(400);
    expect((await h.api().get("/orders").query({ limit: 101 })).status).toBe(400);
    expect((await h.api().get("/orders").query({ status: "shipped" })).status).toBe(400);
  });
});
