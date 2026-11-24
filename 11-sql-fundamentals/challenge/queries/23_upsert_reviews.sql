-- Exercise 23 · Upsert with ON CONFLICT … RETURNING
-- The mobile app syncs reviews in batches. Write ONE statement that saves these two
-- reviews from customer 3. A customer has at most one review per product
-- (UNIQUE (product_id, customer_id)), so an existing review must be UPDATED
-- (rating, body and created_at = now()), and a new one INSERTED.
--   product 11, rating 2, body 'Squeaks after a month.'
--   product 17, rating 5, body 'Crisp panel.'
-- Return:   product_id, customer_id, rating, body   (row order doesn't matter)
-- The test runs your statement inside a transaction and rolls it back afterwards.

