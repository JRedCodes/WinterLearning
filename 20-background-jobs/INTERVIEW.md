# Interview Prep · Background Jobs & Queues

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. When would you move work into a background job, and what do you give up by doing so?
**Your answer:**

### 2. What's the difference between a work queue and pub/sub?
**Your answer:**

### 3. Explain at-most-once, at-least-once and exactly-once delivery. Which does a typical job queue give you, and why?
**Your answer:**

### 4. A job sends a welcome email. How do you make sure a user never gets it twice, even though the job may run more than once?
**Your answer:**

### 5. How do you decide which failures to retry, and how should retries be spaced?
**Your answer:**

### 6. What is a dead-letter queue and how do you operate one?
**Your answer:**

### 7. What happens to in-flight jobs when you deploy a new version of your workers, and how do you handle it?
**Your answer:**

### 8. Your API creates a user in Postgres and then enqueues a welcome-email job. What can go wrong between those two steps, and how would you fix it?
**Your answer:**

### 9. The email queue's backlog grows to 200k jobs during a campaign. How do you investigate and respond?
**Your answer:**
