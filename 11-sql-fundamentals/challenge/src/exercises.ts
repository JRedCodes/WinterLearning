import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type pg from "pg";

export const queriesDir = fileURLToPath(new URL("../queries/", import.meta.url));

export interface QueryResult {
  columns: string[];
  rows: (string | null)[][];
}

/** All exercise files, sorted: ["01_active_products_over_100.sql", ...]. */
export async function listExercises(): Promise<string[]> {
  return (await readdir(queriesDir)).filter((f) => /^\d{2}_.+\.sql$/.test(f)).sort();
}

/** Find an exercise by number ("7", "07") or full file name. */
export async function findExercise(idOrName: string): Promise<string | undefined> {
  const files = await listExercises();
  const prefix = idOrName.padStart(2, "0");
  return files.find((f) => f === idOrName || f.startsWith(`${prefix}_`));
}

export async function readExercise(file: string): Promise<string> {
  return readFile(`${queriesDir}${file}`, "utf8");
}

/** The SQL with comments removed: what's left is what you wrote. */
export function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
}

/**
 * numeric values come back as text like "12.50" or "4.5000000000000000".
 * Trim trailing zeros so 12.5, 12.50 and 12.500 all compare equal.
 * (Rounding still matters: 52.8333 is not 52.83.)
 */
export function normalizeNumeric(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

const NUMERIC_OID = 1700;

/** Run a (single-statement) query and return column names + normalized text rows. */
export async function runQuery(client: pg.Client, sql: string): Promise<QueryResult> {
  const raw = (await client.query({ text: sql, rowMode: "array" })) as unknown;
  // A file with several statements returns one result per statement: use the last one.
  const result = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as pg.QueryArrayResult;
  const fields = result.fields ?? [];
  const rows = (result.rows ?? []).map((row) =>
    row.map((value, i) => {
      if (value === null || value === undefined) return null;
      const text = String(value);
      return fields[i]?.dataTypeID === NUMERIC_OID ? normalizeNumeric(text) : text;
    }),
  );
  return { columns: fields.map((f) => f.name), rows };
}
