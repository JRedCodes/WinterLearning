-- Projects group tasks. bigint identity keys: compact, ordered, and they come
-- back from node-postgres as strings (JS numbers can't hold every int8).
CREATE TABLE projects (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
