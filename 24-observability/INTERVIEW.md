# Interview Prep · Observability

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. What's the difference between logs, metrics and traces? When would you reach for each?
**Your answer:**

### 2. Why structured (JSON) logging? What makes a good log line?
**Your answer:**

### 3. How do you make every log line in a request carry the request id without passing a logger through every function? What goes wrong with a global variable?
**Your answer:**

### 4. What is metric cardinality and how can it take down your monitoring? Give an example of a good and a bad label.
**Your answer:**

### 5. Why use histograms rather than averages for latency? How do you get a p99 across many instances?
**Your answer:**

### 6. Explain liveness vs readiness probes. What happens if you put a database check in the liveness probe?
**Your answer:**

### 7. How does distributed tracing work across services? What is in a `traceparent` header?
**Your answer:**

### 8. What are SLIs, SLOs and error budgets? Why alert on symptoms rather than causes?
**Your answer:**

### 9. Walk me through how you'd investigate "checkout is slow" in production.
**Your answer:**

### 10. What makes a postmortem useful? What does "blameless" mean in practice?
**Your answer:**
