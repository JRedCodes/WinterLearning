# Hints · The Slow Feed

Open one hint at a time. Give each a real try before opening the next.

## Symptom 1: 41 queries per feed page

<details><summary>Hint 1</summary>

Run with `LOG_QUERIES=true` and request `/feed?limit=5`. How many statements do you see, and which ones repeat? Now find the loop that issues them.
</details>

<details><summary>Hint 2</summary>

`FeedService.getFeed` asks a repository for one author and one comment count *per post*. Each `await` inside the loop is a round trip. You want "all the authors for these posts" and "all the counts for these posts", each in one query.
</details>

<details><summary>Hint 3</summary>

Add batch methods: `UserRepository.findByIds(ids)` using `WHERE id = ANY($1::bigint[])`, and `CommentRepository.countByPostIds(ids)` using `WHERE post_id = ANY($1::bigint[]) GROUP BY post_id` returning a `Map`. In the service, build a `Map` of authors by id and default missing counts to `0`. (`Promise.all` over the old per-post calls doesn't count: it's still N queries.)
</details>

## Symptom 2: too much data leaving the database

<details><summary>Hint 1</summary>

The feed shows a 140-character excerpt. Where is that excerpt computed, and what had to be fetched to compute it?
</details>

<details><summary>Hint 2</summary>

Look at the column list of the query that loads the feed page. The test checks the *returned column names* of every feed query; none may be `body`.
</details>

<details><summary>Hint 3</summary>

Select explicit columns and compute the excerpt in SQL: `left(body, 140) AS excerpt`. `PostRepository.listByAuthor` already does this; the feed query should return a `PostSummary`-like shape too.
</details>

## Symptom 3: duplicate posts and slow deep pages

<details><summary>Hint 1</summary>

Decode a `nextCursor` (`echo <cursor> | base64 -d`, adding `=` padding if needed). What does it actually contain? What happens to "the 10th post" when a new post is inserted at the top?
</details>

<details><summary>Hint 2</summary>

The cursor is an OFFSET in disguise. Replace it with **keyset pagination**: the cursor should hold the sort key of the last post returned, `(created_at, id)`, and the next query should ask for rows strictly after it in `ORDER BY created_at DESC, id DESC` order. Index `posts_created_at_id_idx` already exists for exactly this.
</details>

<details><summary>Hint 3</summary>

```sql
SELECT id, author_id, left(body, 140) AS excerpt, created_at, created_at::text AS position_ts
FROM posts
WHERE (created_at, id) < ($2::timestamptz, $3::bigint)
ORDER BY created_at DESC, id DESC
LIMIT $1   -- limit + 1, to know if there's a next page
```

Put `{ t: position_ts, id }` in the cursor and validate it with a zod schema when decoding. Why `created_at::text` instead of the JS `Date`? Postgres keeps microseconds and `Date` doesn't; the test that inserts a fresh post (`now()`, with microseconds) will catch a lossy cursor. Use the row comparison `(created_at, id) < (...)`, not `created_at < ...` alone: seed posts share timestamps in groups of three.
</details>

## Symptom 4: email lookup scans all users

<details><summary>Hint 1</summary>

`EXPLAIN SELECT * FROM users WHERE lower(email) = lower('user42@example.com');` There's a UNIQUE index on `email`. Why isn't it used?
</details>

<details><summary>Hint 2</summary>

An index stores the column's values. The query compares `lower(email)`, which isn't what the index contains. You need an index whose contents match the expression in the `WHERE`.
</details>

<details><summary>Hint 3</summary>

A new migration with an **expression index** on `lower(email)`. Consider making it `UNIQUE`: "one account per email regardless of case" is the real business rule. (Changing the query to `email = $1` breaks case-insensitivity, and the behavior test will tell you so.)
</details>

## Symptom 5: profile pages scan all posts

<details><summary>Hint 1</summary>

`EXPLAIN` the query from `PostRepository.listByAuthor` with some author id. Which indexes exist on `posts`? (`\d posts` in psql.)
</details>

<details><summary>Hint 2</summary>

`posts.author_id` is a foreign key. Postgres does **not** create indexes for foreign keys automatically. The query filters on `author_id` and sorts by `created_at DESC, id DESC`.
</details>

<details><summary>Hint 3</summary>

A composite index with the equality column first, then the sort columns in the query's order: `(author_id, created_at DESC, id DESC)`. Afterward the plan should use that index with `Index Cond: (author_id = ...)`. Don't worry if a tiny Sort of ~6 rows remains: with so few posts per author the planner may prefer a bitmap scan plus an in-memory sort. For prolific authors the ordered index lets it skip the sort and stop at the `LIMIT`. An index on `author_id` alone would pass the test; compare both plans and decide which you'd ship.
</details>
