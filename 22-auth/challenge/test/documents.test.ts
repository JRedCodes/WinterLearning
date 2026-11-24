import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestContext,
  createAdmin,
  createTestContext,
  registerAndLogin,
  resetState,
  type App,
  type TestContext,
} from "./helpers.js";

let ctx: TestContext;
let alice: string;
let bob: string;
let admin: string;

beforeAll(async () => {
  ctx = await createTestContext();
});
beforeEach(async () => {
  await resetState(ctx);
  alice = (await registerAndLogin(ctx.app, "alice@example.com")).cookie;
  bob = (await registerAndLogin(ctx.app, "bob@example.com")).cookie;
  admin = await createAdmin(ctx, "admin@example.com");
});
afterAll(async () => {
  await closeTestContext(ctx);
});

async function createDoc(app: App, cookie: string, title: string) {
  const res = await request(app).post("/documents").set("Cookie", cookie).send({ title, body: `${title} body` });
  expect(res.status, `create failed: ${JSON.stringify(res.body)}`).toBe(201);
  return res.body.data as { id: string; ownerId: string; title: string };
}

describe("documents require authentication", () => {
  it.each([
    ["get", "/documents"],
    ["post", "/documents"],
    ["get", "/documents/00000000-0000-0000-0000-000000000000"],
  ] as const)("%s %s → 401 without a session", async (method, path) => {
    const res = await request(ctx.app)[method](path).send({ title: "x" });
    expect(res.status).toBe(401);
  });
});

describe("TODO(6) · ownership checks (no IDOR)", () => {
  it("owners can create, read, update and delete their documents", async () => {
    const doc = await createDoc(ctx.app, alice, "Alice plan");
    expect((await request(ctx.app).get(`/documents/${doc.id}`).set("Cookie", alice)).status).toBe(200);
    const patched = await request(ctx.app).patch(`/documents/${doc.id}`).set("Cookie", alice).send({ title: "v2" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.title).toBe("v2");
    expect((await request(ctx.app).delete(`/documents/${doc.id}`).set("Cookie", alice)).status).toBe(204);
    expect((await request(ctx.app).get(`/documents/${doc.id}`).set("Cookie", alice)).status).toBe(404);
  });

  it("other users get 404 (not 403) for someone else's document on read, update and delete", async () => {
    const doc = await createDoc(ctx.app, alice, "Alice secret");
    const get = await request(ctx.app).get(`/documents/${doc.id}`).set("Cookie", bob);
    const patch = await request(ctx.app).patch(`/documents/${doc.id}`).set("Cookie", bob).send({ title: "pwned" });
    const del = await request(ctx.app).delete(`/documents/${doc.id}`).set("Cookie", bob);
    for (const res of [get, patch, del]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
    const still = await request(ctx.app).get(`/documents/${doc.id}`).set("Cookie", alice);
    expect(still.body.data.title, "bob must not have changed alice's doc").toBe("Alice secret");
  });

  it("a missing document is 404 for everyone", async () => {
    const res = await request(ctx.app).get("/documents/7a1f0b2c-0000-4000-8000-000000000000").set("Cookie", admin);
    expect(res.status).toBe(404);
  });

  it("GET /documents lists only the caller's documents", async () => {
    await createDoc(ctx.app, alice, "A1");
    await createDoc(ctx.app, bob, "B1");
    await createDoc(ctx.app, alice, "A2");
    const res = await request(ctx.app).get("/documents").set("Cookie", alice);
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { title: string }) => d.title)).toEqual(["A1", "A2"]);
  });

  it("ownerId comes from the session, never from the request body", async () => {
    const bobId = (await request(ctx.app).get("/auth/me").set("Cookie", bob)).body.data.id;
    const res = await request(ctx.app)
      .post("/documents")
      .set("Cookie", alice)
      .send({ title: "sneaky", ownerId: bobId });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).not.toBe(bobId);
  });
});

describe("TODO(6) · admin policy", () => {
  it("admins see all documents in the list", async () => {
    await createDoc(ctx.app, alice, "A1");
    await createDoc(ctx.app, bob, "B1");
    const res = await request(ctx.app).get("/documents").set("Cookie", admin);
    expect(res.body.data.map((d: { title: string }) => d.title)).toEqual(["A1", "B1"]);
  });

  it("admins can read and delete any document", async () => {
    const doc = await createDoc(ctx.app, alice, "A1");
    expect((await request(ctx.app).get(`/documents/${doc.id}`).set("Cookie", admin)).status).toBe(200);
    expect((await request(ctx.app).delete(`/documents/${doc.id}`).set("Cookie", admin)).status).toBe(204);
  });

  it("admins cannot edit other people's documents (403 FORBIDDEN)", async () => {
    const doc = await createDoc(ctx.app, alice, "A1");
    const res = await request(ctx.app).patch(`/documents/${doc.id}`).set("Cookie", admin).send({ title: "edited" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
