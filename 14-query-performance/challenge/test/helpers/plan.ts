import type pg from "pg";
import type { RecordedQuery } from "../../src/db/queryRecorder.js";

/** One node of a Postgres plan, as returned by EXPLAIN (FORMAT JSON). */
export interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

/** EXPLAINs a recorded query with its original parameter values. */
export async function explain(pool: pg.Pool, q: RecordedQuery, opts: { analyze?: boolean } = {}): Promise<PlanNode> {
  const prefix = opts.analyze ? "EXPLAIN (ANALYZE, FORMAT JSON)" : "EXPLAIN (FORMAT JSON)";
  const { rows } = await pool.query<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(`${prefix} ${q.text}`, q.values);
  return rows[0]!["QUERY PLAN"][0].Plan;
}

/** Every node in the plan tree, depth-first. */
export function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/** A compact one-line-per-node rendering, used in failure messages. */
export function describePlan(node: PlanNode, depth = 0): string {
  const rel = node["Relation Name"] ? ` on ${node["Relation Name"]}` : "";
  const idx = node["Index Name"] ? ` using ${node["Index Name"]}` : "";
  const rows = node["Actual Rows"] !== undefined ? ` (actual rows=${node["Actual Rows"]} loops=${node["Actual Loops"]})` : "";
  const line = `${"  ".repeat(depth)}-> ${node["Node Type"]}${idx}${rel}${rows}`;
  return [line, ...(node.Plans ?? []).map((c) => describePlan(c, depth + 1))].join("\n");
}

export function seqScansOn(plan: PlanNode, tables: readonly string[]): PlanNode[] {
  return flatten(plan).filter(
    (n) => n["Node Type"] === "Seq Scan" && tables.includes(n["Relation Name"] ?? ""),
  );
}

/** Total rows produced by scan nodes reading `table` (needs EXPLAIN ANALYZE). */
export function rowsReadFrom(plan: PlanNode, table: string): number {
  return flatten(plan)
    .filter((n) => n["Relation Name"] === table)
    .reduce((sum, n) => sum + (n["Actual Rows"] ?? 0) * (n["Actual Loops"] ?? 1), 0);
}

export const compactSql = (sql: string) => sql.replace(/\s+/g, " ").trim();
