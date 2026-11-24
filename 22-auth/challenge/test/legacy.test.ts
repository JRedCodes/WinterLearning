import { createHash, createHmac } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createLegacyApp } from "../legacy/app.js";
import { LegacyStore } from "../legacy/store.js";

/**
 * Part B: these tests are the pentest's proof-of-concept exploits.
 * They pass only once the legacy service is patched.
 */
const SECRET = "test-secret-that-is-long-enough-123456";
const PW = "legacy password 1";

let store: LegacyStore;
let app: ReturnType<typeof createLegacyApp>;

beforeEach(() => {
  store = new LegacyStore();
  app = createLegacyApp({ secret: SECRET, store });
});

// The tests forge tokens with their own tiny encoder, independent of legacy/lib/jwt.ts.
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
function forge(header: object, payload: object, secret: string | null): string {
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sig = secret === null ? "" : createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}
const nowSec = () => Math.floor(Date.now() / 1000);

async function signup(email: string, password = PW) {
  const res = await request(app).post("/register").send({ email, password });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; email: string };
}
async function tokenFor(email: string, password = PW) {
  const res = await request(app).post("/login").send({ email, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.token as string;
}

describe("legacy · still works", () => {
  it("register → login → /me → create and read own document", async () => {
    const alice = await signup("alice@example.com");
    const token = await tokenFor("alice@example.com");
    const me = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(me.body).toEqual({ id: alice.id, email: "alice@example.com" });
    const doc = await request(app).post("/documents").set("Authorization", `Bearer ${token}`).send({ title: "hi" });
    expect(doc.status).toBe(201);
    const read = await request(app).get(`/documents/${doc.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(read.status).toBe(200);
    expect(read.body.title).toBe("hi");
  });

  it("accepts a correctly signed, unexpired HS256 token", async () => {
    const alice = await signup("alice@example.com");
    const t = forge({ alg: "HS256", typ: "JWT" }, { sub: alice.id, email: alice.email, iat: nowSec(), exp: nowSec() + 60 }, SECRET);
    expect((await request(app).get("/me").set("Authorization", `Bearer ${t}`)).status).toBe(200);
  });
});

describe("legacy · finding 1: token verification", () => {
  it("rejects unsigned tokens (alg: none)", async () => {
    const alice = await signup("alice@example.com");
    const t = forge({ alg: "none", typ: "JWT" }, { sub: alice.id, email: alice.email, iat: nowSec(), exp: nowSec() + 60 }, null);
    const res = await request(app).get("/me").set("Authorization", `Bearer ${t}`);
    expect(res.status, "a token with alg=none must never be accepted").toBe(401);
  });

  it("rejects tokens using an algorithm other than HS256, even if validly signed", async () => {
    const alice = await signup("alice@example.com");
    const header = b64({ alg: "HS512", typ: "JWT" });
    const payload = b64({ sub: alice.id, email: alice.email, iat: nowSec(), exp: nowSec() + 60 });
    const sig = createHmac("sha512", SECRET).update(`${header}.${payload}`).digest("base64url");
    const res = await request(app).get("/me").set("Authorization", `Bearer ${header}.${payload}.${sig}`);
    expect(res.status, "the server must pin the algorithm, not trust the token header").toBe(401);
  });

  it("rejects expired tokens", async () => {
    const alice = await signup("alice@example.com");
    const t = forge({ alg: "HS256", typ: "JWT" }, { sub: alice.id, email: alice.email, iat: nowSec() - 7200, exp: nowSec() - 3600 }, SECRET);
    const res = await request(app).get("/me").set("Authorization", `Bearer ${t}`);
    expect(res.status, "exp is in the past: token must be rejected").toBe(401);
  });

  it("rejects tokens without a numeric exp", async () => {
    const alice = await signup("alice@example.com");
    const t = forge({ alg: "HS256", typ: "JWT" }, { sub: alice.id, email: alice.email, iat: nowSec() }, SECRET);
    expect((await request(app).get("/me").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });

  it("uses the injected clock for expiry", async () => {
    let now = Date.now();
    const clockApp = createLegacyApp({ secret: SECRET, store, now: () => now, tokenTtlSeconds: 60 });
    await request(clockApp).post("/register").send({ email: "c@example.com", password: PW });
    const { token } = (await request(clockApp).post("/login").send({ email: "c@example.com", password: PW })).body;
    expect((await request(clockApp).get("/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    now += 5 * 60_000; // well past exp (allowing for any reasonable clock-skew leeway)
    expect((await request(clockApp).get("/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });

  it("rejects tokens signed with a different secret", async () => {
    const alice = await signup("alice@example.com");
    const t = forge({ alg: "HS256", typ: "JWT" }, { sub: alice.id, email: alice.email, iat: nowSec(), exp: nowSec() + 60 }, "other-secret");
    expect((await request(app).get("/me").set("Authorization", `Bearer ${t}`)).status).toBe(401);
  });
});

describe("legacy · finding 2: document access", () => {
  it("users cannot read other users' documents by id (404, like a missing doc)", async () => {
    await signup("alice@example.com");
    await signup("bob@example.com");
    const aliceToken = await tokenFor("alice@example.com");
    const bobToken = await tokenFor("bob@example.com");
    const doc = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ title: "alice private", body: "salary: 1M" });
    const res = await request(app).get(`/documents/${doc.body.id}`).set("Authorization", `Bearer ${bobToken}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("salary");
  });
});

describe("legacy · finding 3: login responses", () => {
  it("unknown email and wrong password are indistinguishable", async () => {
    await signup("alice@example.com");
    const wrongPw = await request(app).post("/login").send({ email: "alice@example.com", password: "nope nope nope" });
    const noUser = await request(app).post("/login").send({ email: "zed@example.com", password: "nope nope nope" });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(noUser.body).toEqual(wrongPw.body);
  });
});

describe("legacy · finding 4: password storage", () => {
  it("stores salted, slow hashes: equal passwords get different hashes, and no fast digest is used", async () => {
    await signup("alice@example.com", "shared password");
    await signup("bob@example.com", "shared password");
    const [a, b] = [store.findUserByEmail("alice@example.com")!, store.findUserByEmail("bob@example.com")!];
    expect(a.passwordHash).not.toBe(b.passwordHash);
    for (const algo of ["md5", "sha1", "sha256", "sha512"]) {
      expect(a.passwordHash).not.toContain(createHash(algo).update("shared password").digest("hex"));
    }
    expect(a.passwordHash).not.toContain("shared password");
  });

  it("login still works with the new hashes, and rejects wrong passwords", async () => {
    await signup("alice@example.com", "shared password");
    expect((await request(app).post("/login").send({ email: "alice@example.com", password: "shared password" })).status).toBe(200);
    expect((await request(app).post("/login").send({ email: "alice@example.com", password: "shared passwore" })).status).toBe(401);
  });
});
