CREATE TABLE wallets (
  id            text PRIMARY KEY,
  owner         text NOT NULL,
  balance_cents bigint NOT NULL CHECK (balance_cents >= 0),
  created_at    timestamptz NOT NULL
);

CREATE TABLE transactions (
  seq          bigint GENERATED ALWAYS AS IDENTITY,
  id           text PRIMARY KEY,
  wallet_id    text NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  created_at   timestamptz NOT NULL
);

-- History is read newest-first per wallet; the daily limit sums a wallet's recent withdrawals.
CREATE INDEX transactions_wallet_created_idx ON transactions (wallet_id, created_at DESC, seq DESC);
