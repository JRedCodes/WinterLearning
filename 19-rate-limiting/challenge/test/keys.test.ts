import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { apiKeyOrIp, loginKey } from "../src/middleware/keys.js";

/** Echo what the key functions return for a real Express request. */
function echoApp() {
  const app = express();
  app.use(express.json());
  app.all("/key", (req, res) => {
    res.json({ api: apiKeyOrIp(req), login: loginKey(req), ip: req.ip });
  });
  return app;
}

describe("key functions (TODO 5)", () => {
  const app = echoApp();

  it("apiKeyOrIp: falls back to the client IP", async () => {
    const res = await request(app).get("/key");
    expect(res.body.api).toBe(`ip:${res.body.ip}`);
  });

  it("apiKeyOrIp: same API key → same identity; different keys → different identities", async () => {
    const a1 = await request(app).get("/key").set("x-api-key", "sk_live_alpha");
    const a2 = await request(app).get("/key").set("x-api-key", "sk_live_alpha");
    const b = await request(app).get("/key").set("x-api-key", "sk_live_beta");
    expect(a1.body.api).toBe(a2.body.api);
    expect(a1.body.api).not.toBe(b.body.api);
    expect(a1.body.api.startsWith("ip:"), "with an API key we count per key, not per IP").toBe(false);
  });

  it("apiKeyOrIp: never puts the raw secret into the key", async () => {
    const res = await request(app).get("/key").set("x-api-key", "sk_live_supersecret");
    expect(res.body.api).not.toContain("sk_live_supersecret");
  });

  it("apiKeyOrIp: an empty header counts as no key", async () => {
    const res = await request(app).get("/key").set("x-api-key", "   ");
    expect(res.body.api).toBe(`ip:${res.body.ip}`);
  });

  it("loginKey: normalizes the username and separates users", async () => {
    const ada1 = await request(app).post("/key").send({ username: "Ada" });
    const ada2 = await request(app).post("/key").send({ username: "  ada " });
    const bob = await request(app).post("/key").send({ username: "bob" });
    const none = await request(app).post("/key").send({});
    expect(ada1.body.login).toBe(ada2.body.login);
    expect(ada1.body.login).not.toBe(bob.body.login);
    expect(none.body.login).toEqual(expect.any(String));
    expect(ada1.body.login, "login key should include the IP").toContain(ada1.body.ip);
  });
});
