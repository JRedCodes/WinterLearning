-- Exercise 08 · Anti-join
-- Which products have never been ordered at all (no row in order_items, whatever the order status)?
-- Columns:  id, name
-- Order:    id ascending.
-- Try it with NOT EXISTS. Then think about why NOT IN can bite you when NULLs are around.

