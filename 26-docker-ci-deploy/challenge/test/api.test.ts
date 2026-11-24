import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pingDatabase } from "../src/db/pool.js";
import { PgParcelRepository } from "../src/repositories/parcelRepository.js";
import { ParcelService } from "../src/services/parcelService.js";
import { freshDatabase } from "./helpers/db.js";
import { projectPath } from "./helpers/files.js";

/**
 * The API itself already works (you don't need to change it). These tests make sure it
 * keeps working while you containerize it, and pin down the health/readiness contract
 * that the Dockerfile HEALTHCHECK, compose and graceful shutdown rely on.
 */
let pool: pg.Pool;
let shuttingDown = false;

beforeAll(async () => {
  pool = await freshDatabase();
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  shuttingDown = false;
  await pool.query("TRUNCATE parcels");
});

function app(overrides: { checkDatabase?: () => Promise<boolean> } = {}) {
  return createApp({
    parcels: new ParcelService(new PgParcelRepository(pool)),
    checkDatabase: overrides.checkDatabase ?? (() => pingDatabase(pool)),
    isShuttingDown: () => shuttingDown,
  });
}

describe("health endpoints", () => {
  it("GET /healthz is 200 without touching dependencies", async () => {
    const res = await request(app({ checkDatabase: async () => false })).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz is 200 when the database answers", async () => {
    const res = await request(app()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe(true);
  });

  it("GET /readyz is 503 when the database is down", async () => {
    const res = await request(app({ checkDatabase: async () => false })).get("/readyz");
    expect(res.status).toBe(503);
  });

  it("GET /readyz is 503 while shutting down, so the load balancer stops routing to us", async () => {
    shuttingDown = true;
    const res = await request(app()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("shutting_down");
  });
});

describe("parcels API", () => {
  it("registers, fetches and moves a parcel through its states", async () => {
    const created = await request(app()).post("/parcels").send({ recipient: "Ada", destination: "Berlin" });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`/parcels/${created.body.data.id}`);
    expect(created.body.data).toMatchObject({ recipient: "Ada", status: "registered" });
    expect(created.body.data.trackingCode).toMatch(/^WL[0-9A-F]{10}$/);

    const id = created.body.data.id as string;
    expect((await request(app()).get(`/parcels/${id}`)).body.data.id).toBe(id);

    const moved = await request(app()).post(`/parcels/${id}/status`).send({ status: "in_transit" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe("in_transit");

    const illegal = await request(app()).post(`/parcels/${id}/status`).send({ status: "registered" });
    expect(illegal.status).toBe(409);
    expect(illegal.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("lists parcels filtered by status", async () => {
    const a = app();
    const p1 = await request(a).post("/parcels").send({ recipient: "A", destination: "X" });
    await request(a).post("/parcels").send({ recipient: "B", destination: "Y" });
    await request(a).post(`/parcels/${p1.body.data.id}/status`).send({ status: "in_transit" });
    const res = await request(a).get("/parcels?status=in_transit");
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { recipient: string }) => p.recipient)).toEqual(["A"]);
  });

  it("validates input and returns 404 for unknown parcels", async () => {
    const bad = await request(app()).post("/parcels").send({ recipient: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const missing = await request(app()).get("/parcels/7d0f3c8e-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect((await request(app()).get("/parcels/not-a-uuid")).status).toBe(404);
  });
});

describe("migrations", () => {
  it("are idempotent: running them again applies nothing", async () => {
    expect(await migrate(pool, projectPath("migrations"))).toEqual([]);
  });
});
