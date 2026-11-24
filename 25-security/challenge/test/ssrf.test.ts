import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SECRET, setupTestApp, type TestApp } from "./helpers.js";

let t: TestApp;
let n = 0;

beforeAll(async () => {
  t = await setupTestApp();
});
afterAll(() => t.cleanup());
beforeEach(() => {
  t.network.calls.length = 0;
});

const importUrl = (url: string) =>
  request(t.app).post("/files/import").set("Authorization", t.users.alice.auth).send({ name: `import-${++n}.txt`, url });

describe("import from URL: works", () => {
  it("imports a public URL and the file can be downloaded", async () => {
    const res = await importUrl("https://files.example.com/hello.txt");
    expect(res.status).toBe(201);
    const dl = await request(t.app).get("/files/download").query({ name: res.body.data.name }).set("Authorization", t.users.alice.auth);
    expect(dl.text).toBe("hello from the internet");
  });
});

describe("finding 3: SSRF in import from URL", () => {
  const blocked: [string, string][] = [
    ["cloud metadata endpoint", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"],
    ["metadata by hostname", "http://metadata.google.internal/computeMetadata/v1/"],
    ["localhost", "http://localhost:6379/"],
    ["loopback literal", "http://127.0.0.1:5433/"],
    ["loopback, decimal form", "http://2130706433/"],
    ["loopback, short form", "http://127.1/"],
    ["0.0.0.0", "http://0.0.0.0:3000/admin"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]/"],
    ["IPv6 unique-local", "http://[fd00::1]/"],
    ["private 10/8 via DNS", "http://intranet.corp/wiki"],
    ["private 172.16/12 via DNS", "http://db.internal.example.com/"],
    ["one private address among several", "http://sneaky.example.net/"],
    ["file: scheme", "file:///etc/passwd"],
    ["ftp: scheme", "ftp://files.example.com/hello.txt"],
    ["credentials in URL", "http://admin:hunter2@files.example.com/"],
  ];

  for (const [label, url] of blocked) {
    it(`blocks ${label}: ${url}`, async () => {
      const res = await importUrl(url);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error?.code).toBe("URL_NOT_ALLOWED");
      expect(t.network.calls, "the request must be blocked BEFORE anything is fetched").toHaveLength(0);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
    });
  }

  it("does not follow redirects (a public URL can redirect to an internal one)", async () => {
    const res = await importUrl("https://redirect.example.com/latest");
    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe("UPSTREAM_ERROR");
    expect(t.network.calls).toHaveLength(1);
    expect(["manual", "error"]).toContain(t.network.calls[0]!.init?.redirect);
  });

  it("does not store error responses as files", async () => {
    const res = await importUrl("https://missing.example.com/gone.txt");
    expect(res.status).toBe(502);
    const list = await request(t.app).get("/files").set("Authorization", t.users.alice.auth);
    expect(JSON.stringify(list.body)).not.toContain("missing");
  });
});
