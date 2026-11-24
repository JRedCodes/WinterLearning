# Interview Prep · Event Ticketing Platform

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch. These questions are about **your** design: interviewers ask them to see whether you understand what you built and why. Use your DESIGN.md and DECISIONS.md, and quote real numbers from your tests where you can.

### 1. Walk me through what happens, end to end, when a fan holds two seats and books them.
**Your answer:**

### 2. How do you guarantee a seat is never sold twice? Why that approach rather than SERIALIZABLE isolation, optimistic version checks or a Redis lock?
**Your answer:**

### 3. How do holds expire? What breaks if your background sweeper stops running?
**Your answer:**

### 4. A fan's phone loses signal right after tapping "Book". How does your system make the retry safe, including when two retries arrive at the same time?
**Your answer:**

### 5. Why did you use a transactional outbox instead of publishing to Kafka in the request? What delivery guarantee do you get, and what does that require from consumers?
**Your answer:**

### 6. How does the live seat map reach fans connected to different API instances? What happens if an update message is lost?
**Your answer:**

### 7. What do you cache, what do you deliberately not cache, and how do you keep the cache from serving stale data?
**Your answer:**

### 8. Pick two dependencies (Postgres, Redis, Kafka, the email provider) and tell me what happens when each goes down during an on-sale.
**Your answer:**

### 9. Traffic for the next big on-sale will be 10x what you tested. Where does your design break first, and what would you change?
**Your answer:**

### 10. How did you test the concurrency guarantees? How do you know the tests themselves aren't passing by luck?
**Your answer:**
