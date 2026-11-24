# Hints · Data Modeling & Migrations

Open one hint at a time. `npm run db:reset` + `make psql` + `\d tablename` is the fastest way to see what you actually built.

## TODO 1: Extensions and the trigger function

<details><summary>Hint 1</summary>

Extensions are enabled per database with `CREATE EXTENSION`. A trigger function is a PL/pgSQL function that `RETURNS trigger`.
</details>

<details><summary>Hint 2</summary>

Inside a row-level `BEFORE UPDATE` trigger, `NEW` is the row about to be written. Change a field on it and return it, and the change is saved.
</details>

<details><summary>Hint 3</summary>

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- set the column on NEW, then hand NEW back
END;
$$;
```
Attach it later, per table: `CREATE TRIGGER … BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();`
</details>

## TODO 2: Organizations, users, memberships

<details><summary>Hint 1</summary>

The slug rule is a regular expression. Case-insensitive email uniqueness can't be a plain `UNIQUE` on the column, because `'A' <> 'a'`.
</details>

<details><summary>Hint 2</summary>

Postgres matches regexes with `~`. "Words separated by single hyphens" is: one word, then zero or more groups of `-word`, anchored at both ends. For email, a **unique index on an expression** (`lower(email)`) does the job. `position('@' IN email) > 1` checks the `@`.
</details>

<details><summary>Hint 3</summary>

- `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`
- `CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));`
- memberships: `PRIMARY KEY (organization_id, user_id)` gives you "at most once" for free. Both FKs `ON DELETE CASCADE`. `role text NOT NULL DEFAULT 'member' CHECK (role IN (…))`.
</details>

## TODO 3: Rooms, bookings, attendees

<details><summary>Hint 1</summary>

"Unique among live rooms" is a uniqueness rule that only applies to *some* rows. "No overlapping bookings" is a uniqueness-like rule where "equal" is replaced by "overlaps".
</details>

<details><summary>Hint 2</summary>

A **partial unique index** (`CREATE UNIQUE INDEX … WHERE deleted_at IS NULL`) handles soft deletes. For overlaps, use an **exclusion constraint** over `room_id WITH =` and a time range `WITH &&`. Build the range from your two columns with `tstzrange(starts_at, ends_at, '[)')`. Which bound type makes back-to-back bookings legal? Exclusion constraints accept a `WHERE` clause, just like partial indexes.
</details>

<details><summary>Hint 3</summary>

```sql
CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status = 'confirmed')
```
`organizer_id … REFERENCES users (id) ON DELETE RESTRICT`. `room_id` and both attendee FKs cascade. `features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(features) = 'object')`.
</details>

## TODO 4: ERD

<details><summary>Hint 1</summary>

Look at the ER diagram in the lesson (section 2) and in module 11's README for the syntax.
</details>

<details><summary>Hint 2</summary>

Relationship lines look like `organizations ||--o{ rooms : owns`. Entity blocks list `type name PK|FK "comment"` lines. Preview it in the [Mermaid live editor](https://mermaid.live) or in GitHub.
</details>

## Common errors

<details><summary>"data type bigint has no default operator class for access method gist"</summary>

You forgot `CREATE EXTENSION btree_gist`, or it runs in a later migration than the constraint that needs it.
</details>

<details><summary>"Migration 002_… was changed after it was applied"</summary>

You edited a migration that's already recorded in `schema_migrations` of your dev database. Run `npm run db:reset`. (The tests always start from scratch, so they're unaffected.)
</details>

<details><summary>A test says the insert was accepted but expected 23514, and I used an enum</summary>

Invalid enum input raises `22P02`, which the tests accept for role/status/response. If you see this for something else (capacity, slug, dates), the rule is missing.
</details>
