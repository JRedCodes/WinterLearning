# Schema design cheat sheet

## Table template

```sql
CREATE TABLE things (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint      NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name            text        NOT NULL CONSTRAINT things_name_length CHECK (length(name) BETWEEN 1 AND 100),
  status          text        NOT NULL DEFAULT 'active'
                  CONSTRAINT things_status_valid CHECK (status IN ('active', 'archived')),
  settings        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX things_organization_id_idx ON things (organization_id);   -- FKs aren't auto-indexed
CREATE UNIQUE INDEX things_org_name_live_key ON things (organization_id, name) WHERE deleted_at IS NULL;
CREATE TRIGGER things_set_updated_at BEFORE UPDATE ON things
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## Types

| Data | Type |
|---|---|
| id | `bigint GENERATED ALWAYS AS IDENTITY` or `uuid DEFAULT gen_random_uuid()` |
| text | `text` (+ `CHECK (length(x) <= n)` if a limit is a real rule) |
| money | `numeric(12,2)` or `bigint` cents, plus a currency column if needed |
| instant | `timestamptz` |
| calendar date | `date` |
| time span | `tstzrange`, `daterange`, `interval` |
| yes/no | `boolean NOT NULL DEFAULT false` |
| small fixed set | `text` + `CHECK`, enum, or lookup table |
| variable structure | `jsonb` (+ `CHECK (jsonb_typeof(x) = 'object')`) |
| case-insensitive text | unique index on `lower(x)` or `citext` |

## Relationships

| Shape | Implementation |
|---|---|
| 1 → many | FK on the many side |
| many ↔ many | join table, composite PK of both FKs (+ attributes of the relationship) |
| 1 → 1 | same table, or second table with `PRIMARY KEY REFERENCES parent(id)` |
| tree | `parent_id REFERENCES same_table(id)` (query with recursive CTEs) |

## ON DELETE

`CASCADE` for owned children · `RESTRICT` / `NO ACTION` for valuable history · `SET NULL` for optional links.

## Constraint toolbox

| Rule | Tool |
|---|---|
| required | `NOT NULL` |
| unique | `UNIQUE`, `PRIMARY KEY` |
| unique ignoring case | `CREATE UNIQUE INDEX … (lower(col))` |
| unique among live rows | `CREATE UNIQUE INDEX … WHERE deleted_at IS NULL` |
| value rules on one row | `CHECK (…)` |
| must exist elsewhere | `REFERENCES` |
| no overlaps | `EXCLUDE USING gist (key WITH =, tstzrange(a, b, '[)') WITH &&)` + `btree_gist` |
| "only one active X per Y" | `CREATE UNIQUE INDEX … (y) WHERE status = 'active'` |

## SQLSTATE codes to map in your API

| Code | Name | Typical HTTP |
|---|---|---|
| `23505` | unique_violation | 409 |
| `23P01` | exclusion_violation | 409 |
| `23503` | foreign_key_violation | 404 / 409 / 422 |
| `23514` | check_violation | 422 |
| `23502` | not_null_violation | 422 (or a bug: validation missed it) |
| `22P02` | invalid_text_representation (bad enum/uuid) | 400 / 422 |

## Inspecting a schema in psql

`\d table` · `\d+ table` · `\di` (indexes) · `\dT` (types) · `\df` (functions) ·
`SELECT * FROM schema_migrations;`

## Migration checklist

- [ ] One logical change, file named `NNN_description.sql`
- [ ] Compatible with the currently deployed code?
- [ ] New FK columns indexed?
- [ ] Big table? Use `CONCURRENTLY` / `NOT VALID` + `VALIDATE`, and set `lock_timeout`
- [ ] Backfills batched and outside the migration
- [ ] Never edit an applied migration
