import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POOL_MAX, createConcert, createWallet, describeErrors, startHarness, type Harness } from "./helpers/harness.js";

describe("connections are always returned to the pool", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  const checkedOut = () => h.pool.totalCount - h.pool.idleCount;

  it(`survives more failed deposits than the pool has connections (${POOL_MAX})`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i < POOL_MAX + 5; i++) {
      const res = await h.api().post("/wallets/999999/deposits").send({ amountCents: 100 });
      statuses.push(res.status);
    }
    expect(statuses, `every deposit to a missing wallet should be a 404${describeErrors(h)}`).toEqual(
      Array(POOL_MAX + 5).fill(404),
    );
    expect(checkedOut(), "connections still checked out after all requests finished").toBe(0);

    const wallet = await createWallet(h, 0);
    const ok = await h.api().post(`/wallets/${wallet.id}/deposits`).send({ amountCents: 100 });
    expect(ok.status, "a normal deposit after the failures").toBe(200);
  });

  it("leaves no session 'idle in transaction' after a burst of failing requests", async () => {
    const concert = await createConcert(h, 1, 1000);
    const wallet = await createWallet(h, 10);

    await Promise.all([
      h.api().post("/wallets/424242/deposits").send({ amountCents: 1 }),
      h.api().post("/wallets/424243/deposits").send({ amountCents: 1 }),
      h.api().post("/bookings").send({ concertId: concert.id, walletId: wallet.id, quantity: 1 }),
      h.api().post("/transfers").send({ fromWalletId: wallet.id, toWalletId: 999999, amountCents: 5 }),
    ]);

    const stuck = await h.sql<{ pid: number; query: string }>(
      `SELECT pid, query FROM pg_stat_activity
        WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
    );
    expect(
      stuck.map((s) => s.query),
      "sessions holding an open transaction (they keep their locks until someone kills them)",
    ).toEqual([]);
    expect(checkedOut()).toBe(0);
  });
});
