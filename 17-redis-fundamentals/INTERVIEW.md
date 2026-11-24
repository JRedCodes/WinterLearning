# Interview Prep · Redis Fundamentals

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. What is Redis, and why is it so fast? What does "single-threaded" mean for you as a developer?
**Your answer:**

### 2. You need a leaderboard with "top 10" and "my rank" for millions of players. How would you build it in Redis, and what's the complexity?
**Your answer:**

### 3. How do you count unique daily visitors for a site with 50 million users? Compare a set, a HyperLogLog and a bitmap.
**Your answer:**

### 4. How do transactions (MULTI/EXEC) in Redis differ from transactions in Postgres? When would you use a Lua script instead?
**Your answer:**

### 5. Walk me through implementing a distributed lock with Redis. What are its failure modes?
**Your answer:**

### 6. What is pipelining and why does it matter? How is it different from MULTI?
**Your answer:**

### 7. How does Redis persist data, and what happens when it runs out of memory?
**Your answer:**

### 8. When would you NOT use Redis?
**Your answer:**

### 9. A teammate's code does `const n = Number(await redis.get(k)); await redis.set(k, n + 1);` to count signups. What's wrong, and how do you fix it?
**Your answer:**
