-- Parcels tracked by the API. Status moves forward through a small state machine
-- (see src/domain/parcel.ts); the CHECK constraint is the database's last line of defence.
CREATE TABLE parcels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE,
  recipient     text NOT NULL CHECK (length(recipient) BETWEEN 1 AND 200),
  destination   text NOT NULL CHECK (length(destination) BETWEEN 1 AND 200),
  status        text NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered', 'in_transit', 'out_for_delivery', 'delivered', 'returned')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parcels_status_created_idx ON parcels (status, created_at);
