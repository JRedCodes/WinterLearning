import type { Queryable } from "../lib/db.js";

export interface StoredResponse {
  requestHash: string;
  status: number | null;
  body: unknown;
}

export class IdempotencyRepository {
  async find(db: Queryable, key: string): Promise<StoredResponse | undefined> {
    const { rows } = await db.query<{ request_hash: string; response_status: number | null; response_body: unknown }>(
      "SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1",
      [key],
    );
    const row = rows[0];
    return row ? { requestHash: row.request_hash, status: row.response_status, body: row.response_body } : undefined;
  }

  /** Remembers the response for `key`. If the key already exists, does nothing. */
  async save(db: Queryable, key: string, requestHash: string, status: number, body: unknown): Promise<void> {
    await db.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [key, requestHash, status, JSON.stringify(body)],
    );
  }
}
