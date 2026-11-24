-- Concert ticketing + wallet schema.
-- Money is stored as integer cents in bigint columns (never floats).

CREATE TABLE concerts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text        NOT NULL,
  capacity    integer     NOT NULL CHECK (capacity > 0),
  price_cents bigint      NOT NULL CHECK (price_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner         text        NOT NULL,
  balance_cents bigint      NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concert_id  bigint      NOT NULL REFERENCES concerts (id),
  wallet_id   bigint      NOT NULL REFERENCES wallets (id),
  quantity    integer     NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  total_cents bigint      NOT NULL CHECK (total_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_concert_id_idx ON bookings (concert_id);

-- Append-only money movements. For every wallet:
--   balance_cents = SUM(ledger_entries.amount_cents)
CREATE TABLE ledger_entries (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_id    bigint      NOT NULL REFERENCES wallets (id),
  amount_cents bigint      NOT NULL,
  kind         text        NOT NULL
               CHECK (kind IN ('deposit', 'booking', 'transfer_in', 'transfer_out')),
  reference    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_wallet_id_idx ON ledger_entries (wallet_id);

-- One row per Idempotency-Key the API has seen.
CREATE TABLE idempotency_keys (
  key             text PRIMARY KEY,
  request_hash    text        NOT NULL,
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
