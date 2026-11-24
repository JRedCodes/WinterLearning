-- 001: orders + payments. ALREADY DEPLOYED: don't edit this file, add 002_*.sql instead.
--
-- In a real company "orders" and "payments" would be two services with two
-- databases. They share one database here to keep the setup small, but they
-- never touch each other's tables: they only communicate through events.

-- ---------- orders service ----------
CREATE TABLE products (
  sku          text PRIMARY KEY,
  name         text NOT NULL,
  price_cents  integer NOT NULL CHECK (price_cents > 0),
  stock        integer NOT NULL CHECK (stock >= 0)
);

INSERT INTO products (sku, name, price_cents, stock) VALUES
  ('SKU-MUG', 'Mug', 1200, 100),
  ('SKU-TEE', 'T-shirt', 2500, 100),
  ('SKU-CAP', 'Cap (limited edition)', 1800, 1);

CREATE TABLE orders (
  id           uuid PRIMARY KEY,
  customer_id  text NOT NULL,
  total_cents  integer NOT NULL CHECK (total_cents > 0),
  currency     char(3) NOT NULL DEFAULT 'EUR',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku               text NOT NULL REFERENCES products(sku),
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price_cents  integer NOT NULL,
  PRIMARY KEY (order_id, sku)
);

-- ---------- payments service ----------
CREATE TABLE payments (
  id            bigserial PRIMARY KEY,
  order_id      uuid NOT NULL,
  customer_id   text NOT NULL,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  currency      char(3) NOT NULL,
  event_id      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
