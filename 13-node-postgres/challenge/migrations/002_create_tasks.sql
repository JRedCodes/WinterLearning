CREATE TABLE tasks (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id     bigint       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title          text         NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status         text         NOT NULL DEFAULT 'todo'
                              CHECK (status IN ('todo', 'in_progress', 'done')),
  -- numeric is exact (good for money and estimates) but pg returns it as a string
  estimate_hours numeric(6,2) CHECK (estimate_hours >= 0),
  -- a calendar date with no time zone; watch out for how pg turns it into a JS Date
  due_date       date,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- Postgres does NOT index foreign keys automatically. Listing a project's tasks
-- in creation order is our hottest query, so index exactly that access path.
CREATE INDEX tasks_project_id_created_at_idx ON tasks (project_id, created_at, id);
