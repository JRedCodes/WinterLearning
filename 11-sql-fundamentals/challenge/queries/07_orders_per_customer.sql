-- Exercise 07 · LEFT JOIN + COUNT
-- Number of orders (any status) per customer. Customers who never ordered
-- must appear too, with 0.
-- Columns:  full_name, order_count
-- Order:    order_count descending, then full_name A→Z.
-- Watch out: count(*) vs count(some_column) behave differently after a LEFT JOIN.

