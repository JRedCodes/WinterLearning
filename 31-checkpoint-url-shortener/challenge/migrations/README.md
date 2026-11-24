Put your SQL migrations here as `NNN_name.sql` (for example `001_links.sql`).
`src/db/migrate.ts` applies them in filename order, each in its own transaction, and records
them in `schema_migrations`. The tests drop the schema and re-run every migration before each test.
