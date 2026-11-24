# Interview Prep · Checkpoint: Postgres

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch. These are the kind of questions you'd get when walking an interviewer through this project.

### 1. Walk me through your schema. Why these tables, keys and constraints?
**Your answer:**

### 2. How do you guarantee that an order never oversells stock, even with thousands of concurrent buyers?
**Your answer:**

### 3. An order has five lines and the fourth is out of stock. What happens, step by step, in your code and in Postgres?
**Your answer:**

### 4. How did you avoid deadlocks between orders, and how would you notice them in production if they came back?
**Your answer:**

### 5. Why keyset pagination instead of `LIMIT/OFFSET`? What are its downsides?
**Your answer:**

### 6. How does your product search use an index? Why wouldn't a normal B-tree index work?
**Your answer:**

### 7. How do you handle a duplicate SKU, and why not check with a SELECT first?
**Your answer:**

### 8. How is your code structured, and where do transactions live?
**Your answer:**

### 9. How do you run migrations in production, and what changes when tables are large?
**Your answer:**

### 10. A limited drop: 50,000 people try to buy 500 units within a minute. What breaks first in this design, and how would you evolve it?
**Your answer:**
