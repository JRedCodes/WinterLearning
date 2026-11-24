# Hints · SQL Fundamentals

Open one hint at a time. Run your query with `npm run q -- NN` and look at the rows before opening the next hint. The test output also prints the expected and actual rows side by side.

## 01–05: Basics

<details><summary>Hint 1</summary>

`active` is a boolean column, so `WHERE active` works on its own. For 02, remember that nothing is ever `= NULL`.
</details>

<details><summary>Hint 2</summary>

For 03, the tie at 39.50 is the whole point: `ORDER BY price, name` makes the order (and the cut-off at `LIMIT 5`) deterministic. For 04, `split_part(email, '@', 2)` gives the domain. Lower-case it **before** grouping, or `Example.ORG` becomes its own group.
</details>

<details><summary>Hint 3</summary>

04: `GROUP BY lower(split_part(email, '@', 2))` (or `GROUP BY 1`, or `GROUP BY domain`: Postgres allows output aliases in `GROUP BY`). 05: `CASE WHEN price < 50 THEN … WHEN price < 500 THEN … ELSE … END AS band`. The first true branch wins, so order matters.
</details>

## 06–10: Joins and aggregates

<details><summary>Hint 1</summary>

06 needs `order_items` joined to `products` for the names. 07 needs every customer, which means `customers` must be on the side of the join that's always kept.
</details>

<details><summary>Hint 2</summary>

07: after a `LEFT JOIN`, a customer with no orders still produces one row whose order columns are NULL. `count(*)` counts that row, `count(o.id)` doesn't. 08: `NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)`. 10: the condition on the *sum* goes in `HAVING`, the condition on the *status* goes in `WHERE`.
</details>

<details><summary>Hint 3</summary>

10 skeleton: `FROM customers c JOIN orders o … JOIN order_items oi … WHERE o.status = 'delivered' GROUP BY c.id, c.full_name HAVING sum(oi.quantity * oi.unit_price) > 1000`.
</details>

## 11–16: Dates, subqueries, CTEs, sets

<details><summary>Hint 1</summary>

11: once you join `order_items`, every order appears once per item. How do you count each order only once? 12: you need "the average of this product's category", which is a different value for each row, so the subquery has to refer to the outer row.
</details>

<details><summary>Hint 2</summary>

11: `count(DISTINCT o.id)` and `to_char(date_trunc('month', o.ordered_at), 'YYYY-MM')`. 12: `WHERE p.price > (SELECT avg(p2.price) FROM products p2 WHERE p2.category_id = p.category_id AND p2.active)`. Don't forget the inner query must also only look at active products. 13: compute totals per customer in the CTE, then `LEFT JOIN` customers to it, so customers without orders show up with NULL, which `coalesce` turns into 0.
</details>

<details><summary>Hint 3</summary>

14: `SELECT email FROM <customers joined to non-cancelled orders> EXCEPT SELECT email FROM <customers joined to reviews>`. `EXCEPT` removes duplicates for you. 15: `string_agg(p.name, ', ' ORDER BY p.name)` and `WHERE o.ordered_at >= '2026-05-01' AND o.ordered_at < '2026-06-01'`. 16: `LEFT JOIN reviews`, then `count(r.id)`, `round(avg(r.rating), 2)`, `count(r.body)`. Aggregates skip NULLs, which is exactly what you need.
</details>

## 17–20: Window functions

<details><summary>Hint 1</summary>

17 is "top-1 per group". 18 is "rank inside a group". 19 is "compare with the previous row". 20 is "sum of everything so far, restarting per customer". Each of these is one window function.
</details>

<details><summary>Hint 2</summary>

Window functions can't be used in `WHERE`. For 17, compute `row_number() OVER (PARTITION BY customer_id ORDER BY ordered_at DESC)` in a CTE, then keep `rn = 1` outside. For 18, you can rank over an aggregate in the same query: `rank() OVER (PARTITION BY <category> ORDER BY sum(oi.quantity) DESC)`.
</details>

<details><summary>Hint 3</summary>

19: put the monthly revenue in a CTE (like 11), then `lag(revenue) OVER (ORDER BY month)`. 20: compute one row per order with its total in a CTE (`GROUP BY o.id`), then `sum(order_total) OVER (PARTITION BY customer_id ORDER BY ordered_at)`.
</details>

## 21–22: Recursive CTEs

<details><summary>Hint 1</summary>

Start from the roots (`parent_id IS NULL`), then repeatedly join `categories` whose `parent_id` is a row you already have.
</details>

<details><summary>Hint 2</summary>

21: carry `path` and `depth` along: the anchor selects `name::text AS path, 1 AS depth`, and the recursive part selects `t.path || ' > ' || c.name, t.depth + 1`. The `::text` cast keeps the column type consistent between the two halves. 22: instead of a path, carry the **root's id** down the tree, so every category knows which top-level category it belongs to.
</details>

<details><summary>Hint 3</summary>

22 skeleton:
```sql
WITH RECURSIVE tree AS (
  SELECT id, id AS root_id FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.root_id FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT … FROM order_items … JOIN products p … JOIN tree t ON t.id = p.category_id
JOIN categories root ON root.id = t.root_id …
```
</details>

## 23–24: Writes

<details><summary>Hint 1</summary>

23 needs `INSERT … VALUES (…), (…) ON CONFLICT (…) DO UPDATE SET …`. The conflict target is the unique pair from the schema.
</details>

<details><summary>Hint 2</summary>

Inside `DO UPDATE`, `EXCLUDED.rating` is the value you tried to insert. `created_at = now()` refreshes the timestamp. Finish with `RETURNING product_id, customer_id, rating, body`.
</details>

<details><summary>Hint 3</summary>

24: `UPDATE products SET price = round(price * 1.10, 2) WHERE active AND category_id = (SELECT id FROM categories WHERE name = 'Furniture') RETURNING id, name, price;`. Before writing an `UPDATE`, always check what its `WHERE` matches with a `SELECT`.
</details>
