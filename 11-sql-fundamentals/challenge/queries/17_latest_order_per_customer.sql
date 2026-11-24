-- Exercise 17 · Window functions: ROW_NUMBER
-- For each customer who has ever ordered, show their single most recent order (any status).
-- Columns:  full_name, order_id, ordered_at, status
-- Order:    full_name A→Z.
-- Classic "top-1 per group": number rows within each customer, keep row 1.

