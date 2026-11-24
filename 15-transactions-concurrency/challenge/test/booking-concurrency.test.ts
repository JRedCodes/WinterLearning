import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  balanceOf,
  countStatuses,
  createConcert,
  createWallet,
  describeErrors,
  ledgerMismatches,
  startHarness,
  type Harness,
} from "./helpers/harness.js";

describe("bookings under concurrency", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  async function soldInDb(concertId: number): Promise<number> {
    const [row] = await h.sql<{ sold: string }>(
      "SELECT COALESCE(SUM(quantity), 0) AS sold FROM bookings WHERE concert_id = $1",
      [concertId],
    );
    return Number(row!.sold);
  }

  it("30 fans racing for 5 seats: exactly 5 bookings succeed, the rest get 409 SOLD_OUT", async () => {
    const concert = await createConcert(h, 5, 100);
    const wallets = await Promise.all(Array.from({ length: 30 }, (_, i) => createWallet(h, 1000, `fan${i}`)));

    const responses = await Promise.all(
      wallets.map((w) => h.api().post("/bookings").send({ concertId: concert.id, walletId: w.id, quantity: 1 })),
    );

    const statuses = countStatuses(responses);
    expect(statuses, `status counts ${JSON.stringify(statuses)}${describeErrors(h)}`).toEqual({ 201: 5, 409: 25 });
    expect(await soldInDb(concert.id), "seats sold in the database (capacity is 5)").toBe(5);
    const c = await h.api().get(`/concerts/${concert.id}`);
    expect(c.body.data.ticketsSold).toBe(5);
  });

  it("multi-ticket bookings racing for 7 seats never exceed capacity", async () => {
    const concert = await createConcert(h, 7, 100);
    const wallets = await Promise.all(Array.from({ length: 20 }, (_, i) => createWallet(h, 1000, `fan${i}`)));

    const responses = await Promise.all(
      wallets.map((w) => h.api().post("/bookings").send({ concertId: concert.id, walletId: w.id, quantity: 2 })),
    );

    const statuses = countStatuses(responses);
    expect(statuses, `status counts ${JSON.stringify(statuses)}${describeErrors(h)}`).toEqual({ 201: 3, 409: 17 });
    expect(await soldInDb(concert.id)).toBe(6);
  });

  it("one wallet buying in parallel can never spend more than it has", async () => {
    const concert = await createConcert(h, 100, 100);
    const wallet = await createWallet(h, 500);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.api().post("/bookings").send({ concertId: concert.id, walletId: wallet.id, quantity: 1 }),
      ),
    );

    const statuses = countStatuses(responses);
    expect(statuses, `status counts ${JSON.stringify(statuses)}${describeErrors(h)}`).toEqual({ 201: 5, 422: 5 });
    expect(await balanceOf(h, wallet.id)).toBe(0);
    expect(await soldInDb(concert.id)).toBe(5);
    expect(await ledgerMismatches(h), "wallet balance must equal the sum of its ledger entries").toEqual([]);
  });
});
