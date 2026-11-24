-- Exercise 22 · Recursive CTE: roll-up
-- Revenue (non-cancelled orders, quantity * unit_price) per TOP-LEVEL category, counting
-- products in any descendant category (Laptops counts toward Electronics, and so on).
-- Uncategorised products are ignored. Top-level categories with no sales may be omitted.
-- Columns:  category  (top-level category name)
--           revenue
-- Order:    revenue descending.

