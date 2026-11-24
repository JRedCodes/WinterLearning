import type pg from "pg";
import type { Queryable } from "./pool.js";

export interface RecordedQuery {
  text: string;
  values: unknown[];
  /** Column names the query returned (from the result's field metadata). */
  fields: string[];
  rowCount: number | null;
  durationMs: number;
}

/**
 * Wraps any Queryable and records every query that goes through it.
 *
 * - The tests use it to count queries per request and to EXPLAIN exactly
 *   the SQL your repositories ran.
 * - server.ts uses it with LOG_QUERIES=true to print each statement, which
 *   is the fastest way to *see* an N+1.
 */
export class QueryRecorder implements Queryable {
  readonly queries: RecordedQuery[] = [];

  constructor(
    private readonly inner: Queryable,
    private readonly onQuery?: (q: RecordedQuery) => void,
  ) {}

  async query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<pg.QueryResult<R>> {
    const start = performance.now();
    const result = await this.inner.query<R>(text, values);
    const recorded: RecordedQuery = {
      text,
      values,
      fields: (result.fields ?? []).map((f) => f.name),
      rowCount: result.rowCount,
      durationMs: performance.now() - start,
    };
    this.queries.push(recorded);
    this.onQuery?.(recorded);
    return result;
  }

  reset(): void {
    this.queries.length = 0;
  }
}
