-- Exercise 04 · String functions + GROUP BY
-- How many customers do we have per email domain? Some emails were stored with
-- mixed case ("carla@Example.ORG"), so compare domains case-insensitively.
-- Columns:  domain     (lower-case, the part after the '@', e.g. 'example.org')
--           customers  (number of customers with that domain)
-- Order:    customers descending, then domain A→Z.

