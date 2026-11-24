CREATE TABLE kudos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_name   text        NOT NULL CHECK (length(from_name) BETWEEN 1 AND 60),
  to_name     text        NOT NULL CHECK (length(to_name) BETWEEN 1 AND 60),
  message     text        NOT NULL CHECK (length(message) BETWEEN 1 AND 280),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kudos_created_at_idx ON kudos (created_at DESC, id DESC);
