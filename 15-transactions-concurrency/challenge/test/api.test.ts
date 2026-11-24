import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { balanceOf, createConcert, createWallet, ledgerMismatches, startHarness, type Harness } from "./helpers/harness.js";

/**
 * Single-request behaviour. These mostly pass on the starter: the bugs in this
 * module only show up under concurrency, retries or repeated failures.
 */
describe("tickets & wallet API (single requests)", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it("GET /health", async () => {
    const res = await h.api().get("/health");
    expect(res.status).toBe(200);
  });

  it("creates and reads a concert", async () => {
    const concert = await createConcert(h, 50, 2500);
    const res = await h.api().get(`/concerts/${concert.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: concert.id, capacity: 50, priceCents: 2500, ticketsSold: 0 });
  });

  it("creates a wallet whose opening balance is in the ledger", async () => {
    const wallet = await createWallet(h, 1000);
    expect(await balanceOf(h, wallet.id)).toBe(1000);
    expect(await ledgerMismatches(h)).toEqual([]);
  });

  it("books tickets, charges the wallet and records a ledger entry", async () => {
    const concert = await createConcert(h, 10, 300);
    const wallet = await createWallet(h, 1000);

    const res = await h.api().post("/bookings").send({ concertId: concert.id, walletId: wallet.id, quantity: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ concertId: concert.id, walletId: wallet.id, quantity: 2, totalCents: 600 });
    expect(res.headers.location).toBe(`/bookings/${res.body.data.id}`);

    expect(await balanceOf(h, wallet.id)).toBe(400);
    const c = await h.api().get(`/concerts/${concert.id}`);
    expect(c.body.data.ticketsSold).toBe(2);
    expect(await ledgerMismatches(h)).toEqual([]);

    const b = await h.api().get(`/bookings/${res.body.data.id}`);
    expect(b.status).toBe(200);
    expect(b.body.data.id).toBe(res.body.data.id);
  });

  it("rejects a booking larger than the remaining capacity with 409 SOLD_OUT", async () => {
    const concert = await createConcert(h, 3, 100);
    const wallet = await createWallet(h, 10_000);
    const res = await h.api().post("/bookings").send({ concertId: concert.id, walletId: wallet.id, quantity: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SOLD_OUT");
  });

  it("rolls back the whole booking when the wallet can't pay (422 INSUFFICIENT_FUNDS)", async () => {
    const concert = await createConcert(h, 10, 500);
    const wallet = await createWallet(h, 400);
    const res = await h.api().post("/bookings").send({ concertId: concert.id, walletId: wallet.id, quantity: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_FUNDS");

    const [row] = await h.sql<{ n: string }>("SELECT count(*) AS n FROM bookings");
    expect(Number(row!.n), "no booking row may survive a failed payment").toBe(0);
    expect(await balanceOf(h, wallet.id)).toBe(400);
  });

  it("returns 404 for unknown concerts, wallets and bookings", async () => {
    const wallet = await createWallet(h, 100);
    const concert = await createConcert(h, 5);
    expect((await h.api().get("/concerts/999999")).status).toBe(404);
    expect((await h.api().get("/wallets/999999")).status).toBe(404);
    expect((await h.api().get("/bookings/999999")).status).toBe(404);
    const r1 = await h.api().post("/bookings").send({ concertId: 999999, walletId: wallet.id, quantity: 1 });
    expect(r1.status).toBe(404);
    const r2 = await h.api().post("/bookings").send({ concertId: concert.id, walletId: 999999, quantity: 1 });
    expect(r2.status).toBe(404);
  });

  it("validates request bodies (400 VALIDATION_ERROR)", async () => {
    const res = await h.api().post("/bookings").send({ concertId: 1, walletId: 1, quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const dep = await h.api().post("/wallets/1/deposits").send({ amountCents: -5 });
    expect(dep.status).toBe(400);
  });

  it("deposits money", async () => {
    const wallet = await createWallet(h, 0);
    const res = await h.api().post(`/wallets/${wallet.id}/deposits`).send({ amountCents: 750 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.balanceCents).toBe(750);
    expect(await ledgerMismatches(h)).toEqual([]);
  });

  it("transfers money between wallets", async () => {
    const a = await createWallet(h, 1000, "alice");
    const b = await createWallet(h, 0, "bob");
    const res = await h.api().post("/transfers").send({ fromWalletId: a.id, toWalletId: b.id, amountCents: 300 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ fromBalanceCents: 700, toBalanceCents: 300 });
    expect(await balanceOf(h, a.id)).toBe(700);
    expect(await balanceOf(h, b.id)).toBe(300);
    expect(await ledgerMismatches(h)).toEqual([]);
  });

  it("rejects transfers without funds (422) and to the same wallet (422)", async () => {
    const a = await createWallet(h, 100, "alice");
    const b = await createWallet(h, 0, "bob");
    const poor = await h.api().post("/transfers").send({ fromWalletId: a.id, toWalletId: b.id, amountCents: 101 });
    expect(poor.status).toBe(422);
    expect(poor.body.error.code).toBe("INSUFFICIENT_FUNDS");
    const self = await h.api().post("/transfers").send({ fromWalletId: a.id, toWalletId: a.id, amountCents: 1 });
    expect(self.status).toBe(422);
    expect(await balanceOf(h, a.id)).toBe(100);
    expect(await balanceOf(h, b.id)).toBe(0);
  });
});
