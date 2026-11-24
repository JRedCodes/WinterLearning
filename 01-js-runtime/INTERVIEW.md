# Interview Prep · The JavaScript Runtime

Answer in your own words, out loud first, then write. Model answers live on the `solutions` branch.

### 1. Node.js is single-threaded. How can it handle thousands of concurrent connections?
**Your answer:**

### 2. Explain the event loop. What are microtasks and macrotasks, and in what order do they run?
**Your answer:**

### 3. What does "blocking the event loop" mean? How would you detect it in production and how would you fix it?
**Your answer:**

### 4. What's wrong with `items.forEach(async (item) => { await save(item); })`? How do you fix it, and how do you choose between the fixes?
**Your answer:**

### 5. Compare `Promise.all`, `Promise.allSettled`, `Promise.race` and `Promise.any`. Give a use case for each.
**Your answer:**

### 6. JavaScript is single-threaded, so can you have race conditions? Give an example and a fix.
**Your answer:**

### 7. What is an unhandled promise rejection, what does Node do about it, and how do you prevent them?
**Your answer:**

### 8. How do you implement a timeout for an async operation? What's the role of `AbortController`, and what's the catch?
**Your answer:**

### 9. What's the difference between `process.nextTick`, `setImmediate` and `setTimeout(fn, 0)`? When would you use `nextTick`?
**Your answer:**

### 10. What is backpressure in Node streams and why does it matter?
**Your answer:**
