-- Exercise 24 · UPDATE … RETURNING
-- Supplier costs went up: raise the price of every ACTIVE product in the 'Furniture'
-- category by 10%, rounded to 2 decimals. Look the category up by name (don't hard-code its id).
-- Return:   id, name, price   (the NEW price; row order doesn't matter)
-- The test runs your statement inside a transaction and rolls it back afterwards.

