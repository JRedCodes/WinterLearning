-- Social feed schema.
CREATE TABLE users (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        text        NOT NULL UNIQUE,
  handle       text        NOT NULL UNIQUE,
  display_name text        NOT NULL,
  bio          text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id  bigint      NOT NULL REFERENCES users (id),
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The global feed is ordered newest first.
CREATE INDEX posts_created_at_id_idx ON posts (created_at, id);

CREATE TABLE comments (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id    bigint      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id  bigint      NOT NULL REFERENCES users (id),
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_post_id_idx ON comments (post_id);
