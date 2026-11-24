import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  balanceOf,
  countStatuses,
  createWallet,
  describeErrors,
  ledgerMismatches,
  startHarness,
  type Harness,
} from "./helpers/harness.js";

describe("wallets under concurrency", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it("50 concurrent deposits are all counted (no lost updates)", async () => {
    const wallet = await createWallet(h, 0);

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => h.api().post(`/wallets/${wallet.id}/deposits`).send({ amountCents: 100 })),
    );

    expect(countStatuses(responses), describeErrors(h)).toEqual({ 200: 50 });
    expect(await balanceOf(h, wallet.id), "50 deposits x 100 cents").toBe(5000);
    expect(await ledgerMismatches(h), "wallet balance must equal the sum of its ledger entries").toEqual([]);
  });

  it("transfers A->B and B->A at the same time all succeed (no deadlocks)", async () => {
    const a = await createWallet(h, 10_000, "alice");
    const b = await createWallet(h, 10_000, "bob");

    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        h
          .api()
          .post("/transfers")
          .send(
            i % 2 === 0
              ? { fromWalletId: a.id, toWalletId: b.id, amountCents: 100 }
              : { fromWalletId: b.id, toWalletId: a.id, amountCents: 100 },
          ),
      ),
    );

    const statuses = countStatuses(responses);
    expect(statuses, `status counts ${JSON.stringify(statuses)}${describeErrors(h)}`).toEqual({ 201: 40 });
    expect(await balanceOf(h, a.id)).toBe(10_000);
    expect(await balanceOf(h, b.id)).toBe(10_000);
  });

  it("a storm of random transfers conserves money and never goes negative", async () => {
    const wallets = await Promise.all([0, 1, 2, 3].map((i) => createWallet(h, 2_000, `w${i}`)));
    // Deterministic pseudo-random sequence so failures are reproducible.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const transfers = Array.from({ length: 60 }, () => {
      const from = rand(4);
      const to = (from + 1 + rand(3)) % 4;
      return { fromWalletId: wallets[from]!.id, toWalletId: wallets[to]!.id, amountCents: 100 + rand(400) };
    });

    const responses = await Promise.all(transfers.map((t) => h.api().post("/transfers").send(t)));

    const unexpected = responses.filter((r) => r.status !== 201 && r.status !== 422);
    expect(unexpected.map((r) => r.status), `only 201 or 422 allowed${describeErrors(h)}`).toEqual([]);

    const balances = await Promise.all(wallets.map((w) => balanceOf(h, w.id)));
    expect(balances.reduce((s, b) => s + b, 0), "total money in the system").toBe(8_000);
    for (const b of balances) expect(b).toBeGreaterThanOrEqual(0);
    expect(await ledgerMismatches(h), "wallet balance must equal the sum of its ledger entries").toEqual([]);
  });
});
