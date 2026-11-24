# Interview Prep · Postgres from Node

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. What's the difference between a `pg.Client` and a `pg.Pool`, and why do servers use a pool?
**Your answer:**

### 2. How would you choose the pool size for a service? What happens when it's too small, and when it's too large?
**Your answer:**

### 3. Explain SQL injection and how parameterized queries prevent it. What can't be a parameter, and how do you handle that safely?
**Your answer:**

### 4. Your API returns `"id": "42"` and `"price": "19.90"` as strings. Why does `pg` do that, and how would you handle each?
**Your answer:**

### 5. Walk me through how you'd implement a transaction helper in Node. What are the subtle failure cases?
**Your answer:**

### 6. A teammate wrote `await pool.query("BEGIN")`, two updates with `pool.query`, then `await pool.query("COMMIT")`. What's wrong?
**Your answer:**

### 7. How do you make several repository calls atomic without putting SQL or `pg` types in the service layer?
**Your answer:**

### 8. How does a migration runner work? Would you run migrations at app startup or as a separate step?
**Your answer:**

### 9. ORM, query builder, or raw SQL: what would you pick for a new service, and why?
**Your answer:**

### 10. How do you test code that talks to Postgres?
**Your answer:**
