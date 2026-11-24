import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKvServer, type Clock, type KvServer, type KvServerOptions, type KvStats } from "../src/index.js";

/** A clock you move by hand. Tests never wait for real TTLs. */
export class ManualClock implements Clock {
  constructor(private current = Date.UTC(2026, 0, 1)) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

/** Creates a fresh temp directory and returns it with a cleanup function. */
export async function tempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "kv-lite-test-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export interface Running {
  kv: KvServer;
  base: string;
}

/** createKvServer + listen(0). Options default to a fast sweep that won't interfere. */
export async function start(options: KvServerOptions): Promise<Running> {
  const kv = await createKvServer({ sweepIntervalMs: 60_000, ...options });
  const port = await kv.listen(0);
  return { kv, base: `http://127.0.0.1:${port}` };
}

export function put(base: string, key: string, value: string, init: { ttl?: number | string; type?: string } = {}) {
  const qs = init.ttl === undefined ? "" : `?ttl=${init.ttl}`;
  return fetch(`${base}/kv/${key}${qs}`, {
    method: "PUT",
    headers: { "content-type": init.type ?? "text/plain" },
    body: value,
  });
}

export async function stats(base: string): Promise<KvStats> {
  const res = await fetch(`${base}/stats`);
  if (res.status !== 200) throw new Error(`GET /stats returned ${res.status}`);
  return (await res.json()) as KvStats;
}

export async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code ?? `<no error.code in ${JSON.stringify(body)}>`;
}
