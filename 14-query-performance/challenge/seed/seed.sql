-- Deterministic seed data, generated inside Postgres (fast: no round trips per row).
-- ~20k users, 120k posts (timestamps tied in groups of 3), 240k comments with a skewed distribution.
INSERT INTO users (email, handle, display_name, bio, created_at)
SELECT 'User' || i || '@Example.com', 'user' || i, 'User ' || i, repeat('bio ', 20),
       timestamptz '2025-01-01 00:00:00+00' + i * interval '10 minutes'
FROM generate_series(1, 20000) AS i;
INSERT INTO posts (author_id, body, created_at)
SELECT 1 + (i * 7919) % 20000, 'Post ' || i || ': ' || repeat(md5(i::text), 12),
       timestamptz '2026-06-01 00:00:00+00' - (i / 3) * interval '1 minute'
FROM generate_series(1, 120000) AS i;
INSERT INTO comments (post_id, author_id, body, created_at)
SELECT 1 + (j::bigint * j) % 120000, 1 + (j * 13) % 20000, 'Comment ' || j,
       timestamptz '2026-06-02 00:00:00+00' + j * interval '1 second'
FROM generate_series(1, 240000) AS j;
ANALYZE;
