/**
 * The app itself is provided and already works: these tests pass from the start.
 * They pin down the contract your manifests rely on (probe endpoints, env vars).
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { InMemoryKudosRepository } from "../src/repositories/kudosRepository.js";
import { KudosService } from "../src/services/kudosService.js";

function build(opts: { dbUp?: boolean; draining?: boolean } = {}) {
  return createApp({
    kudos: new KudosService(new InMemoryKudosRepository()),
    checkDatabase: async () => opts.dbUp ?? true,
    isShuttingDown: () => opts.draining ?? false,
    appVersion: "test-1",
  });
}

describe("probe endpoints (provided)", () => {
  it("GET /healthz is 200 even when the database is down (liveness must not check dependencies)", async () => {
    const res = await request(build({ dbUp: false })).get("/healthz");
    expect(res.status).toBe(200);
  });

  it("GET /readyz is 200 when the database answers", async () => {
    const res = await request(build()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  it("GET /readyz is 503 when the database is down", async () => {
    const res = await request(build({ dbUp: false })).get("/readyz");
    expect(res.status).toBe(503);
  });

  it("GET /readyz is 503 while draining after SIGTERM", async () => {
    const res = await request(build({ draining: true })).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("shutting_down");
  });

  it("GET /whoami reports the pod (hostname) and version", async () => {
    const res = await request(build()).get("/whoami");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pod: expect.any(String), version: "test-1" });
  });
});

describe("kudos API (provided)", () => {
  it("creates and lists kudos, newest first", async () => {
    const app = build();
    const a = await request(app).post("/kudos").send({ from: "Ana", to: "Ben", message: "Great review!" });
    expect(a.status).toBe(201);
    expect(a.headers.location).toBe(`/kudos/${a.body.data.id}`);
    await request(app).post("/kudos").send({ from: "Ben", to: "Ana", message: "Thanks for pairing" });
    const list = await request(app).get("/kudos?limit=10");
    expect(list.body.data.map((k: { from: string }) => k.from)).toEqual(["Ben", "Ana"]);
  });

  it("validates input and refuses self-kudos", async () => {
    const app = build();
    expect((await request(app).post("/kudos").send({ from: "Ana", to: "ana", message: "me!" })).status).toBe(400);
    expect((await request(app).post("/kudos").send({ from: "Ana" })).status).toBe(400);
    expect((await request(app).get("/kudos?limit=0")).status).toBe(400);
  });

  it("returns 404 for unknown kudos and unknown routes", async () => {
    const app = build();
    expect((await request(app).get("/kudos/999")).status).toBe(404);
    expect((await request(app).get("/nope")).body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("config (provided)", () => {
  it("reads DB settings from the environment", () => {
    const c = loadConfig({ DB_HOST: "postgres", DB_PORT: "5432", DB_PASSWORD: "s3cret", PORT: "3000" });
    expect(c.db).toMatchObject({ host: "postgres", port: 5432, password: "s3cret" });
    expect(c.port).toBe(3000);
  });

  it("fails fast with a readable message on bad values", () => {
    expect(() => loadConfig({ DB_PORT: "not-a-port" })).toThrow(/DB_PORT/);
  });
});
