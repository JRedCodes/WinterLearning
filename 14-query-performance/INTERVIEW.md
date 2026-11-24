# Interview Prep · Query Performance

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. An endpoint got slow. Walk me through how you'd find out why.
**Your answer:**

### 2. How do you read an `EXPLAIN ANALYZE` plan? What are the first things you look for?
**Your answer:**

### 3. How does a B-tree index work, and what does that imply about which queries it can speed up?
**Your answer:**

### 4. You have a composite index on `(a, b)`. Which of these can use it: `WHERE a = ?`, `WHERE b = ?`, `WHERE a = ? ORDER BY b`, `WHERE a > ? AND b = ?`? Why?
**Your answer:**

### 5. Why might Postgres ignore an index you just created?
**Your answer:**

### 6. What are the costs of adding indexes? When would you not add one?
**Your answer:**

### 7. What is the N+1 query problem, how do you detect it, and how do you fix it?
**Your answer:**

### 8. Compare OFFSET and keyset (cursor) pagination. How do you implement keyset pagination correctly?
**Your answer:**

### 9. What are partial and expression indexes? Give a real use case for each.
**Your answer:**

### 10. Your database CPU is fine, but API latency is high and climbing under load. What could be going on?
**Your answer:**
