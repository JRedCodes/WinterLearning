import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { isValidEmail } from "../src/lib/validation.js";
import { setupTestApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await setupTestApp();
});
afterAll(() => t.cleanup());

describe("profile: works", () => {
  it("updates displayName and email", async () => {
    const res = await request(t.app)
      .patch("/me")
      .set("Authorization", t.users.bob.auth)
      .send({ displayName: "Robert", email: "robert@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ displayName: "Robert", email: "robert@example.com", isAdmin: false });
  });

  it("admins can list users, others can't", async () => {
    await request(t.app).get("/admin/users").set("Authorization", t.users.root.auth).expect(200);
    await request(t.app).get("/admin/users").set("Authorization", t.users.bob.auth).expect(403);
  });
});

describe("finding 4: mass assignment", () => {
  it("a user cannot make themselves admin through PATCH /me", async () => {
    await request(t.app).patch("/me").set("Authorization", t.users.alice.auth).send({ displayName: "Al", isAdmin: true });
    const { rows } = await t.pool.query("SELECT is_admin FROM users WHERE id = $1", [t.users.alice.id]);
    expect(rows[0].is_admin, "alice became admin").toBe(false);
    await request(t.app).get("/admin/users").set("Authorization", t.users.alice.auth).expect(403);
  });

  it("a user cannot overwrite other columns (id, settings, created_at)", async () => {
    await request(t.app)
      .patch("/me")
      .set("Authorization", t.users.alice.auth)
      .send({ id: 999, settings: { injected: true }, createdAt: "2000-01-01T00:00:00Z" });
    const { rows } = await t.pool.query("SELECT id, settings, created_at FROM users WHERE email = 'alice@example.com'");
    expect(rows[0].id).toBe(t.users.alice.id);
    expect(rows[0].settings).not.toHaveProperty("injected");
    expect(new Date(rows[0].created_at).getFullYear()).not.toBe(2000);
  });
});

describe("finding 5: prototype pollution in settings", () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  const put = (rawJson: string) =>
    request(t.app).put("/me/settings").set("Authorization", t.users.bob.auth).set("Content-Type", "application/json").send(rawJson);

  it("merges nested settings without wiping siblings", async () => {
    await put('{"notifications":{"email":false,"push":true},"theme":"dark"}').expect(200);
    const res = await put('{"notifications":{"email":true}}').expect(200);
    expect(res.body.data).toEqual({ notifications: { email: true, push: true }, theme: "dark" });
  });

  it("a top-level __proto__ key does not pollute Object.prototype", async () => {
    await put('{"__proto__":{"polluted":"yes"}}');
    expect(({} as Record<string, unknown>).polluted, "Object.prototype was polluted").toBeUndefined();
  });

  it("a nested __proto__ key does not pollute Object.prototype", async () => {
    await put('{"theme2":{"__proto__":{"polluted":"yes"}}}');
    expect(({} as Record<string, unknown>).polluted, "Object.prototype was polluted").toBeUndefined();
  });

  it("dangerous keys (__proto__, constructor, prototype) are never stored", async () => {
    await put('{"constructor":{"prototype":{"polluted":"yes"}},"a":{"__proto__":{"x":1}}}');
    const res = await request(t.app).get("/me/settings").set("Authorization", t.users.bob.auth).expect(200);
    const json = JSON.stringify(res.body.data);
    expect(json).not.toContain("constructor");
    expect(json).not.toContain("__proto__");
    expect(json).not.toContain("polluted");
  });
});

describe("finding 6: ReDoS in email validation", () => {
  const evil = `${"a".repeat(28)}!`;

  it("accepts normal addresses and rejects malformed ones", () => {
    for (const ok of ["alice@example.com", "first.last@example.co.uk", "a_b-c@mail.example.org", "x1@y.io"]) {
      expect(isValidEmail(ok), ok).toBe(true);
    }
    for (const bad of ["no-at.example.com", "@example.com", "a@b", "a@@example.com", ".lead@example.com", "a b@example.com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("rejects absurdly long input (RFC 5321 caps an address at 254 characters)", () => {
    expect(isValidEmail(`${"a".repeat(300)}@example.com`)).toBe(false);
  });

  it("rejects a pathological input quickly (validator)", () => {
    const start = performance.now();
    expect(isValidEmail(evil)).toBe(false);
    expect(performance.now() - start, "the regex backtracks catastrophically").toBeLessThan(50);
  });

  it("rejects a pathological input quickly (over HTTP: the event loop stays free)", async () => {
    const start = performance.now();
    const res = await request(t.app).patch("/me").set("Authorization", t.users.bob.auth).send({ email: evil });
    expect(res.status).toBe(400);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
