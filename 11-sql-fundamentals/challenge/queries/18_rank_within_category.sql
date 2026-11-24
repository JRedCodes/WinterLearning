-- Exercise 18 · Window functions: RANK with ties
-- Best sellers per category. Units sold = sum of quantity over NON-cancelled orders.
-- Rank each product within its direct category by units sold (most first).
-- Products that tie must share a rank, and the next rank skips (1, 2, 2, 4 …).
-- Only include products that sold at least one unit; skip uncategorised products.
-- Columns:  category, product, units_sold, rank
-- Order:    category A→Z, then rank, then product A→Z.

