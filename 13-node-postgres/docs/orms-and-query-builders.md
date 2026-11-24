# Raw SQL, query builders and ORMs

You'll be asked about this in interviews, and you'll inherit codebases that made each choice. This page gives you the vocabulary and the trade-offs, using the challenge's `listTasks` as a running example.

## The same query, four ways

**Raw `pg`** (the challenge):

```ts
const where: string[] = [];
const params: unknown[] = [];
if (filter.projectId) { params.push(filter.projectId); where.push(`project_id = $${params.length}`); }
if (filter.status)    { params.push(filter.status);    where.push(`status = $${params.length}`); }
params.push(filter.limit ?? 50);
const { rows } = await db.query<TaskRow>(
  `SELECT ${TASK_COLUMNS} FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""}
   ORDER BY created_at, id LIMIT $${params.length}`,
  params,
);
return rows.map(toTask);
```

**Kysely** (type-safe query builder):

```ts
let q = db.selectFrom("tasks").select(["id", "project_id", "title", "status"]);
if (filter.projectId) q = q.where("project_id", "=", filter.projectId);
if (filter.status) q = q.where("status", "=", filter.status);
const rows = await q.orderBy("created_at").orderBy("id").limit(filter.limit ?? 50).execute();
```

**Drizzle** (schema in TS, SQL-like API):

```ts
const rows = await db.select().from(tasks)
  .where(and(
    filter.projectId ? eq(tasks.projectId, filter.projectId) : undefined,
    filter.status ? eq(tasks.status, filter.status) : undefined,
  ))
  .orderBy(tasks.createdAt, tasks.id)
  .limit(filter.limit ?? 50);
```

**Prisma** (ORM with a generated client):

```ts
const rows = await prisma.task.findMany({
  where: { projectId: filter.projectId, status: filter.status },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  take: filter.limit ?? 50,
});
```

Notice how the dynamic `WHERE` building, which is the error-prone part of the raw version, disappears in the others. That's the main thing builders buy you.

## What each layer gives and takes

### Raw SQL
- ✅ Full power of Postgres; zero magic; exactly what runs is what you wrote.
- ✅ Easy to paste into `psql` and `EXPLAIN` (module 14).
- ❌ Row types are hand-written promises; nothing checks them against the schema.
- ❌ Dynamic queries are string building; easy to get placeholder numbering wrong.

### Query builders (Kysely, Knex)
- ✅ Composable, injection-safe dynamic queries.
- ✅ Kysely infers result types from a schema interface (which you can generate from the database with tools like kysely-codegen).
- ✅ Still SQL-shaped: if you know SQL, you can read it, and you can predict the SQL it generates.
- ❌ Another API to learn; very exotic SQL may need `sql\`...\`` template escapes.

### ORMs (Prisma, Drizzle, TypeORM, MikroORM, Sequelize)
- ✅ Fast CRUD, relations (`include: { tasks: true }`), migrations tooling, generated types.
- ✅ Great for teams and apps where most queries are simple.
- ❌ Easy to write N+1 queries without noticing (lazy relations).
- ❌ Some generate surprising SQL; performance work means reading query logs.
- ❌ Advanced features (`FOR UPDATE SKIP LOCKED`, CTEs, window functions, partial indexes) range from awkward to unsupported, so you drop to raw SQL anyway.
- ❌ "Active record" style ORMs (entity objects that save themselves) blur the line between domain and persistence, which fights the layering from module 06.

Drizzle and Prisma sit in different spots: Drizzle is close to a query builder with a schema; Prisma is a full ORM with its own schema language and query engine.

## The repository is your insurance

Whichever tool you pick, keep it **inside repositories**. Then:

- Switching from raw `pg` to Kysely is a repository-local refactor; the contract tests tell you when you're done.
- Services stay testable with in-memory fakes.
- ORM-specific types (Prisma's generated models, TypeORM entities) don't leak into the domain.

A common smell: Prisma models used directly as domain types and returned from controllers. It's fast at first; later every schema change is an API change.

## A pragmatic default

For a team comfortable with SQL building a service like the ones in this course:

1. Query builder (Kysely) for most repository queries.
2. Raw SQL via the builder's `sql` tag for complex reporting, locking and bulk operations.
3. A dedicated migration tool (or the builder's migrator).
4. Repository interfaces at the service boundary, contract-tested.

If the team is less SQL-fluent and the app is CRUD-heavy, an ORM like Prisma or Drizzle is a reasonable choice. Pair it with query logging in development and a habit of checking `EXPLAIN` for anything on a hot path.

## Interview soundbite

> "I like staying close to SQL: a type-safe query builder like Kysely inside repositories, raw SQL where needed. ORMs speed up CRUD, but they can hide N+1 queries and make advanced Postgres features awkward. Either way, I keep the data-access tool behind a repository interface so the choice doesn't spread through the codebase."
