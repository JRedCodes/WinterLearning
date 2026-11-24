-- Exercise 16 · NULLs inside aggregates
-- Rating overview for every ACTIVE product, including products with no reviews.
-- Columns:  product
--           review_count       number of reviews (0 if none)
--           avg_rating         average rating rounded to 2 decimals, NULL if no reviews
--           reviews_with_text  number of reviews whose body is not NULL
-- Order:    review_count descending, then product A→Z.

