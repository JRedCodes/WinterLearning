CREATE TABLE users (
  id           serial PRIMARY KEY,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_admin     boolean NOT NULL DEFAULT false,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- API tokens are stored as SHA-256 hashes: a database leak doesn't leak usable tokens.
CREATE TABLE api_tokens (
  token_hash text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE files (
  id           serial PRIMARY KEY,
  owner_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  size_bytes   integer NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
