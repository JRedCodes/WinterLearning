-- Exercise 06 · INNER JOIN + computed columns
-- Customer support needs the lines of order #6 with product names.
-- Columns:  product     (product name)
--           quantity
--           unit_price  (the price PAID, from order_items, not today's price)
--           line_total  (quantity * unit_price)
-- Order:    line_total descending, then product A→Z.

