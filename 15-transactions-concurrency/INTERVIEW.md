# Interview Prep · Transactions & Concurrency

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. What does ACID stand for, and which of the four properties is a "dial" rather than an absolute guarantee?
**Your answer:**

### 2. Explain the lost update anomaly with an example. How would you prevent it in Postgres?
**Your answer:**

### 3. What's the difference between Read Committed, Repeatable Read and Serializable in Postgres? Which anomalies does each allow?
**Your answer:**

### 4. What is write skew, and why doesn't Repeatable Read prevent it?
**Your answer:**

### 5. How does MVCC work in Postgres, and what does it mean that "readers don't block writers"?
**Your answer:**

### 6. Pessimistic vs optimistic locking: how does each work and when would you choose which?
**Your answer:**

### 7. How do deadlocks happen, how does Postgres handle them, and how do you prevent them?
**Your answer:**

### 8. You switched a transaction to SERIALIZABLE. What else must change in your application code?
**Your answer:**

### 9. Design idempotent `POST /payments`. How do you guarantee a retried request never charges twice, even when two copies arrive at the same time?
**Your answer:**

### 10. Your API suddenly returns "timeout exceeded when trying to connect" on every endpoint. What could cause that, and how would you investigate?
**Your answer:**
