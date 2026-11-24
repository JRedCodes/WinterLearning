CREATE TABLE products (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku          text        NOT NULL UNIQUE,
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  price_cents  integer     NOT NULL CHECK (price_cents >= 0),
  stock        integer     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
