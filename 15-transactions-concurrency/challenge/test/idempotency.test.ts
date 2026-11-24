import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  balanceOf,
  countStatuses,
  createConcert,
  createWallet,
  describeErrors,
  startHarness,
  type Harness,
} from "./helpers/harness.js";

describe("Idempotency-Key on POST /bookings", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  async function bookingCount(): Promise<number> {
    const [row] = await h.sql<{ n: string }>("SELECT count(*) AS n FROM bookings");
    return Number(row!.n);
  }

  it("a retried request returns the original booking and charges once", async () => {
    const concert = await createConcert(h, 10, 300);
    const wallet = await createWallet(h, 1000);
    const body = { concertId: concert.id, walletId: wallet.id, quantity: 1 };

    const first = await h.api().post("/bookings").set("Idempotency-Key", "retry-1").send(body);
    const second = await h.api().post("/bookings").set("Idempotency-Key", "retry-1").send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(await bookingCount()).toBe(1);
    expect(await balanceOf(h, wallet.id)).toBe(700);
  });

  it("rejects reusing a key with a different body (422 IDEMPOTENCY_KEY_REUSED)", async () => {
    const concert = await createConcert(h, 10, 300);
    const wallet = await createWallet(h, 1000);
    await h.api().post("/bookings").set("Idempotency-Key", "k").send({ concertId: concert.id, walletId: wallet.id, quantity: 1 });
    const res = await h
      .api()
      .post("/bookings")
      .set("Idempotency-Key", "k")
      .send({ concertId: concert.id, walletId: wallet.id, quantity: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("8 copies of the same request arriving at once (client retry storm) book and charge exactly once", async () => {
    const concert = await createConcert(h, 100, 300);
    const wallet = await createWallet(h, 10_000);
    const body = { concertId: concert.id, walletId: wallet.id, quantity: 2 };

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => h.api().post("/bookings").set("Idempotency-Key", "storm-1").send(body)),
    );

    const statuses = countStatuses(responses);
    expect(statuses, `every copy should get the same 201 response${describeErrors(h)}`).toEqual({ 201: 8 });
    const ids = new Set(responses.map((r) => r.body.data?.id));
    expect(ids.size, `all copies must return the same booking id, got ${[...ids].join(", ")}`).toBe(1);
    expect(await bookingCount(), "booking rows created").toBe(1);
    expect(await balanceOf(h, wallet.id), "charged exactly once (2 x 300)").toBe(10_000 - 600);
  });

  it("a request that failed does not burn its key: the retry can succeed later", async () => {
    const concert = await createConcert(h, 10, 500);
    const wallet = await createWallet(h, 100);
    const body = { concertId: concert.id, walletId: wallet.id, quantity: 1 };

    const failed = await h.api().post("/bookings").set("Idempotency-Key", "later").send(body);
    expect(failed.status).toBe(422);

    await h.api().post(`/wallets/${wallet.id}/deposits`).send({ amountCents: 400 });
    const retried = await h.api().post("/bookings").set("Idempotency-Key", "later").send(body);
    expect(retried.status, JSON.stringify(retried.body)).toBe(201);
    expect(await balanceOf(h, wallet.id)).toBe(0);
  });

  it("different keys are different bookings", async () => {
    const concert = await createConcert(h, 10, 100);
    const wallet = await createWallet(h, 1000);
    const body = { concertId: concert.id, walletId: wallet.id, quantity: 1 };
    const a = await h.api().post("/bookings").set("Idempotency-Key", "a").send(body);
    const b = await h.api().post("/bookings").set("Idempotency-Key", "b").send(body);
    expect(a.body.data.id).not.toBe(b.body.data.id);
    expect(await bookingCount()).toBe(2);
  });
});
