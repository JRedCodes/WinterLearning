// npm run q -- 07     → runs queries/07_*.sql and prints the result as a table.
// Writes (exercises 23–24) run inside a transaction that is rolled back.
import { connect } from "../src/db.js";
import { findExercise, readExercise, runQuery, stripComments } from "../src/exercises.js";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: npm run q -- <exercise number>   e.g. npm run q -- 7");
  process.exit(1);
}
const file = await findExercise(arg);
if (!file) {
  console.error(`No exercise matching "${arg}" in queries/`);
  process.exit(1);
}
const sql = await readExercise(file);
if (!stripComments(sql)) {
  console.error(`${file} has no query yet. Write one below the comment.`);
  process.exit(1);
}

const client = await connect();
try {
  await client.query("BEGIN");
  const { columns, rows } = await runQuery(client, sql);
  console.log(`\n${file}: ${rows.length} row(s)\n`);
  console.table(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))));
} catch (err) {
  console.error(`\n${file} failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
