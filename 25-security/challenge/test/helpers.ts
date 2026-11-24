import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { hashToken } from "../src/lib/tokens.js";
import type { FetchLike } from "../src/lib/urlImporter.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/wl_25";
export const ALLOWED_ORIGIN = "https://app.files.test";
export const SECRET = "TOP-SECRET-DO-NOT-SERVE";

/** DNS as seen by the app in tests. IP literals resolve to themselves, like dns.lookup does. */
const DNS: Record<string, string[]> = {
  "files.example.com": ["93.184.216.34"],
  "redirect.example.com": ["93.184.216.40"],
  "missing.example.com": ["93.184.216.41"],
  localhost: ["127.0.0.1", "::1"],
  "metadata.google.internal": ["169.254.169.254"],
  "intranet.corp": ["10.20.30.40"],
  "sneaky.example.net": ["93.184.216.35", "192.168.1.10"],
  "db.internal.example.com": ["172.20.0.5"],
};

export interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

export function fakeNetwork() {
  const calls: FetchCall[] = [];
  const resolveHost = async (hostname: string): Promise<string[]> => {
    const bare = hostname.replace(/^\[|\]$/g, "");
    if (isIP(bare)) return [bare];
    return DNS[hostname.toLowerCase()] ?? [];
  };
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const host = new URL(url).hostname;
    if (host === "files.example.com") {
      return new Response("hello from the internet", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (host === "redirect.example.com") {
      return new Response("moved", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }
    if (host === "missing.example.com") return new Response("not found", { status: 404 });
    // Anything else is "internal": a real SSRF would reach it.
    return new Response(`INTERNAL ${SECRET} iam-credentials`, { status: 200, headers: { "content-type": "text/plain" } });
  };
  return { fetch, resolveHost, calls };
}

export interface TestUser {
  id: number;
  token: string;
  auth: string;
}

/**
 * Fresh schema, three users (alice, bob: normal; root: admin), a temp storage
 * dir with secret files planted OUTSIDE each user's folder, and the app.
 */
export async function setupTestApp() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } catch (err) {
    await pool.end();
    throw new Error(`Postgres not reachable (${DATABASE_URL}). Run \`make up\`. ${(err as Error).message}`);
  }
  await migrate(pool);

  const users: Record<"alice" | "bob" | "root", TestUser> = {} as never;
  for (const [name, admin] of [["alice", false], ["bob", false], ["root", true]] as const) {
    const { rows } = await pool.query<{ id: number }>(
      "INSERT INTO users (email, display_name, is_admin) VALUES ($1, $2, $3) RETURNING id",
      [`${name}@example.com`, name, admin],
    );
    const token = `${name}-test-token`;
    await pool.query("INSERT INTO api_tokens (token_hash, user_id) VALUES ($1, $2)", [hashToken(token), rows[0]!.id]);
    users[name] = { id: rows[0]!.id, token, auth: `Bearer ${token}` };
  }

  const base = await mkdtemp(path.join(tmpdir(), "wl25-"));
  const storageDir = path.join(base, "storage");
  await mkdir(storageDir, { recursive: true });
  // Planted secrets: inside the storage root but outside any user folder, and outside the root entirely.
  await writeFile(path.join(storageDir, "secret.txt"), SECRET);
  await writeFile(path.join(base, "secret.txt"), SECRET);
  await writeFile(path.join(base, ".env"), `DATABASE_PASSWORD=${SECRET}`);

  const network = fakeNetwork();
  const app = createApp({
    pool,
    storageDir,
    corsOrigins: [ALLOWED_ORIGIN],
    fetch: network.fetch,
    resolveHost: network.resolveHost,
  });

  const cleanup = async () => {
    await pool.end();
    await rm(base, { recursive: true, force: true });
  };
  return { app, pool, users, network, storageDir, cleanup };
}

export type TestApp = Awaited<ReturnType<typeof setupTestApp>>;
