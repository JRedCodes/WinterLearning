# Interview Prep · Kubernetes Fundamentals

Answer out loud first, then write it down in your own words. Model answers are on the `solutions` branch.

### 1. Walk me through what happens, component by component, when you `kubectl apply` a Deployment with 3 replicas.
**Your answer:**

### 2. What's the difference between a Pod, a ReplicaSet and a Deployment? Why don't you create Pods directly?
**Your answer:**

### 3. How does a Service know which pods to send traffic to? What's the most common way that breaks?
**Your answer:**

### 4. Explain liveness vs readiness vs startup probes. What goes wrong if your liveness probe checks the database?
**Your answer:**

### 5. What do resource requests and limits do? What happens when a container exceeds its CPU limit vs its memory limit?
**Your answer:**

### 6. How does a rolling update work, and how do you make it zero-downtime?
**Your answer:**

### 7. ConfigMap vs Secret: what's actually different, and are Secrets secure?
**Your answer:**

### 8. Why would you use a StatefulSet instead of a Deployment? Would you run your production Postgres in Kubernetes?
**Your answer:**

### 9. How should database migrations run when you deploy to Kubernetes, and why not on app startup?
**Your answer:**
