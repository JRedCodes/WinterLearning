# Interview Prep · Rate Limiting

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. Compare fixed window, sliding window and token bucket rate limiting. When would you pick each?
**Your answer:**

### 2. Your service runs 10 instances behind a load balancer. How do you enforce "100 requests per minute per user" across all of them?
**Your answer:**

### 3. Every Redis command is atomic. Why isn't `GET` followed by `INCR` safe for a rate limiter, and how do you fix it?
**Your answer:**

### 4. What should a rate-limited HTTP response look like? Which status code and headers, and why?
**Your answer:**

### 5. Redis goes down. Should your rate limiter fail open or fail closed?
**Your answer:**

### 6. What would you use as the rate-limit key for a public API? For a login endpoint? What are the pitfalls of using the IP address?
**Your answer:**

### 7. Where in the architecture would you apply rate limiting: CDN, API gateway or application? Why might you use more than one?
**Your answer:**

### 8. How would you implement a token bucket without a background job refilling every bucket?
**Your answer:**

### 9. Design question: design a distributed rate limiter for an API with 50k requests per second. What are the bottlenecks?
**Your answer:**
