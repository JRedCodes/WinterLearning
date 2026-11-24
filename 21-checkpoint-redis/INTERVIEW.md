# Interview Prep · Checkpoint: Redis

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. Walk me through the architecture of the link preview service you built. What does each component own?
**Your answer:**

### 2. How do you guarantee that 5,000 concurrent requests for the same new URL trigger only one fetch, across multiple API instances?
**Your answer:**

### 3. Why does POST return 202 instead of the preview? What are the alternatives to client polling?
**Your answer:**

### 4. What's in Redis and what's in Postgres, and why? What happens if Redis loses all its data?
**Your answer:**

### 5. How does your worker decide whether to retry a failed fetch? Where does that logic live in your code and why?
**Your answer:**

### 6. How did you keep the service layer independent of Express, Postgres, Redis and BullMQ? Why bother?
**Your answer:**

### 7. A partner says their requests are being rate limited even though they're under the documented limit. How do you investigate?
**Your answer:**

### 8. What would you change to run this at 50x the traffic?
**Your answer:**

### 9. What security risks does a "fetch any URL" service have, and how would you mitigate them?
**Your answer:**
