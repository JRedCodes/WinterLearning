# 📖 Glossary

Plain-English definitions of the terms used across WinterLearning. Numbers in brackets link to the module where a term is taught or used most. For commands rather than definitions, see the [cheat sheets](cheatsheets/README.md).

**Jump to:** [#](#0-9) · [A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [J](#j) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [Q](#q) · [R](#r) · [S](#s) · [T](#t) · [U](#u) · [V](#v) · [W](#w) · [X](#x) · Y · [Z](#z)

*180 terms.*

---

## 0-9

**2xx / 4xx / 5xx**: Status code families: 2xx means success, 4xx means the client sent something wrong, 5xx means the server failed. Clients and monitoring treat the families very differently, so pick codes carefully. [03](../03-http-fundamentals/README.md) [05](../05-express-basics/README.md)

---

## A

**ACID**: The four guarantees of a database transaction: Atomicity (all or nothing), Consistency (constraints hold), Isolation (concurrent transactions don't see each other's half-done work) and Durability (committed data survives a crash). [15](../15-transactions-concurrency/README.md)

**Acks (Kafka)**: Producer setting for how many replicas must confirm a write before it counts as sent. `acks=all` (-1) is the safest; `acks=0` is fastest and can silently lose data. [32](../32-kafka-fundamentals/README.md)

**Advisory lock**: A Postgres lock on an arbitrary number you choose rather than on a row, used as an application-level mutex (for example so only one instance runs migrations). [15](../15-transactions-concurrency/README.md)

**API gateway**: A server in front of your services that handles cross-cutting concerns like routing, auth, rate limiting and TLS termination, so each service doesn't reimplement them. [19](../19-rate-limiting/README.md) [30](../30-system-design/README.md)

**AsyncLocalStorage**: A Node API that stores values for the lifetime of an async call chain. It's how a request-scoped logger or request id follows a request through every `await` without passing it as an argument. [24](../24-observability/README.md)

**At-least-once delivery**: A messaging guarantee where every message is delivered, but possibly more than once (after a crash or retry). It's the common default, so consumers must be idempotent. [20](../20-background-jobs/README.md) [32](../32-kafka-fundamentals/README.md) [33](../33-event-driven-architecture/README.md)

**At-most-once delivery**: A messaging guarantee where a message is delivered zero or one times: no duplicates, but crashes can lose messages. [28](../28-realtime/README.md) [32](../32-kafka-fundamentals/README.md)

**Authentication (authn)**: Proving who someone is, for example by checking a password or a signed token. [22](../22-auth/README.md)

**Authorization (authz)**: Deciding what an authenticated user is allowed to do, for example by role or by ownership of a resource. [22](../22-auth/README.md)

---

## B

**B-tree index**: Postgres's default index type: a sorted tree that makes equality lookups, ranges and `ORDER BY` fast on the indexed columns. [14](../14-query-performance/README.md)

**Back-of-envelope estimate**: A quick order-of-magnitude calculation (requests per second, storage per year) used in design to decide whether a simple solution is enough or something bigger is needed. [30](../30-system-design/README.md)

**Backoff (exponential, with jitter)**: Waiting longer after each failed retry (for example 100ms, 200ms, 400ms...) so a struggling dependency gets breathing room. Adding random jitter stops many clients from retrying at the same instant. [20](../20-background-jobs/README.md) [29](../29-reliability-scaling/README.md)

**Backpressure**: A way for a slow consumer to signal a fast producer to slow down, instead of buffering data until memory runs out. Streams, queues and WebSockets all need it. [01](../01-js-runtime/README.md) [28](../28-realtime/README.md) [29](../29-reliability-scaling/README.md)

**bcrypt / argon2 / scrypt**: Deliberately slow password-hashing functions with a built-in salt. Their slowness makes brute-forcing stolen hashes expensive, unlike fast hashes such as SHA-256. [22](../22-auth/README.md)

**Blue/green deployment**: Running two full production environments and switching traffic from the old (blue) to the new (green) at once, which makes rollback a quick switch back. [26](../26-docker-ci-deploy/README.md)

**Branded type**: A TypeScript trick that makes structurally identical types incompatible (for example `UserId` vs `OrderId`, both strings), so the compiler catches swapped arguments. [08](../08-typescript-for-backends/README.md)

**Bulkhead**: Limiting how many concurrent calls go to one dependency, so a slow dependency can only exhaust its own slice of resources rather than the whole service. [29](../29-reliability-scaling/README.md)

---

## C

**Cache invalidation**: Removing or updating cached data when the source changes. Delete-on-write and versioned keys are the usual strategies, and getting it wrong means serving stale data. [18](../18-caching/README.md)

**Cache stampede**: Many requests missing the same expired key at once and all hitting the database together. Prevented with locks, request coalescing or randomized early expiry. Also called dogpile. [18](../18-caching/README.md)

**Cache-aside**: The most common caching pattern: the app checks the cache, and on a miss loads from the database and writes the result into the cache itself. [18](../18-caching/README.md)

**Canary release**: Sending a small percentage of traffic to a new version first and widening it only if error rates and latency look healthy. [26](../26-docker-ci-deploy/README.md)

**CAP theorem**: In a distributed system, when a network partition happens you must choose between consistency (everyone sees the same data) and availability (every request gets an answer). [30](../30-system-design/README.md)

**Cardinality (metrics)**: The number of distinct label combinations a metric has. Labels like raw URLs or user ids explode cardinality and can take down a metrics system. [24](../24-observability/README.md)

**CDC (change data capture)**: Streaming a database's changes (inserts, updates, deletes) from its write-ahead log to other systems, for example with Debezium into Kafka. [33](../33-event-driven-architecture/README.md)

**CDN**: A content delivery network: servers around the world that cache static files and responses close to users to cut latency and offload your origin. [30](../30-system-design/README.md)

**Circuit breaker**: A wrapper that stops calling a failing dependency for a while (open), then lets a trial request through (half-open), and resumes normally when it succeeds (closed). It turns slow failures into fast ones. [29](../29-reliability-scaling/README.md)

**Component, props and state (React)**: A component is a function that returns UI; props are inputs passed in by its parent; state is data the component owns and changes over time, triggering a re-render. [R1](../R1-react-fundamentals/README.md)

**Composite index**: An index on several columns. Column order matters: it helps queries that filter on a leading prefix of the columns. [14](../14-query-performance/README.md)

**Composition root**: The one place (here `server.ts`) where the app reads config, creates real implementations and wires them together. Everything else receives its dependencies instead of creating them. [05](../05-express-basics/README.md) [06](../06-layered-architecture/README.md)

**ConfigMap**: A Kubernetes object holding non-secret configuration that pods read as environment variables or files. [34](../34-kubernetes-fundamentals/README.md)

**Connection pool**: A set of open database connections reused across requests, because opening a connection per query is slow. Too small causes queueing; too large overwhelms the database. [13](../13-node-postgres/README.md) [14](../14-query-performance/README.md)

**Consistent hashing**: A way of mapping keys to servers so that adding or removing a server only moves a small fraction of keys. Used in caches and sharded stores. [30](../30-system-design/README.md)

**Consumer group**: A set of Kafka consumers that share a topic's partitions, so each partition is processed by exactly one member of the group. [32](../32-kafka-fundamentals/README.md)

**Consumer lag**: How far a consumer group is behind the newest messages in a partition. Rising lag means consumers can't keep up. [32](../32-kafka-fundamentals/README.md)

**Container**: A running process isolated by the OS with its own filesystem from an image. Lighter than a virtual machine because it shares the host kernel. [00](../00-dev-environment/README.md) [26](../26-docker-ci-deploy/README.md)

**CORS**: Cross-Origin Resource Sharing: browser rules that block a page from reading responses from another origin unless the server allows it with `Access-Control-Allow-*` headers. [03](../03-http-fundamentals/README.md) [25](../25-security/README.md) [R2](../R2-react-data/README.md)

**Covering index**: An index that contains every column a query needs (often via `INCLUDE`), so Postgres can answer from the index without visiting the table. [14](../14-query-performance/README.md)

**CrashLoopBackOff**: A Kubernetes pod state where the container keeps starting and crashing, and Kubernetes waits longer between each restart. [35](../35-kubernetes-in-practice/README.md)

**CSRF**: Cross-Site Request Forgery: a malicious site making a logged-in user's browser send a request to your app with their cookies. SameSite cookies and CSRF tokens prevent it. [22](../22-auth/README.md) [25](../25-security/README.md)

**CTE**: Common Table Expression: a named subquery defined with `WITH` that makes complex SQL readable. Recursive CTEs can walk trees and graphs. [11](../11-sql-fundamentals/README.md)

**Cursor (keyset) pagination**: Paging by a pointer to the last item seen, as in `WHERE (created_at, id) < (...) ORDER BY ... LIMIT n`, instead of an offset, so deep pages stay fast and results don't shift when rows are inserted. [14](../14-query-performance/README.md) [23](../23-api-design/README.md)

**Custom hook**: A function starting with `use` that bundles React hooks into reusable logic, such as `useLocalStorage` or `useTasks`. [R1](../R1-react-fundamentals/README.md) [R2](../R2-react-data/README.md)

---

## D

**Data transfer object (DTO)**: A plain object shaped for crossing a boundary (an HTTP response, a message), kept separate from internal domain entities so they can evolve independently. [06](../06-layered-architecture/README.md) [08](../08-typescript-for-backends/README.md)

**Dead-letter queue (DLQ)**: A place where messages that keep failing are parked after N attempts, so they stop blocking the queue and can be inspected or replayed later. [20](../20-background-jobs/README.md) [33](../33-event-driven-architecture/README.md)

**Deadlock**: Two transactions each waiting for a lock the other holds, so neither can continue. Postgres detects it and aborts one; acquiring locks in a consistent order prevents it. [15](../15-transactions-concurrency/README.md)

**Dependency injection**: Passing a component the things it needs (a repository, a clock) instead of letting it create or import them, which makes code swappable and testable. [06](../06-layered-architecture/README.md)

**Deployment (Kubernetes)**: An object that keeps a desired number of identical pods running and rolls out new versions gradually through ReplicaSets. [34](../34-kubernetes-fundamentals/README.md)

**Discriminated union**: A TypeScript union where each member has a literal tag field (like `kind` or `status`), letting the compiler narrow to the right variant and check that a switch handles every case. [02](../02-typescript-fundamentals/README.md) [08](../08-typescript-for-backends/README.md)

**Docker Compose**: A tool that starts several containers (app, Postgres, Redis) from one YAML file with shared networking. Every module's `make up` uses it. [00](../00-dev-environment/README.md) [26](../26-docker-ci-deploy/README.md)

**Domain error**: An error that describes a business rule violation (`InsufficientStockError`) without knowing about HTTP. The error handler maps it to a status code. [06](../06-layered-architecture/README.md) [07](../07-validation-errors-config/README.md)

**Dual write**: Writing to two systems (a database and a message broker) without a shared transaction, so one can succeed while the other fails and they drift apart. The outbox pattern fixes it. [33](../33-event-driven-architecture/README.md)

---

## E

**Error budget**: The amount of unreliability an SLO allows (for 99.9%, about 43 minutes a month). Spending it pauses risky releases; saving it allows faster shipping. [24](../24-observability/README.md)

**ETag**: A version identifier for a response. Clients send it back in `If-None-Match` to get a cheap 304, or in `If-Match` to prevent overwriting someone else's change. [03](../03-http-fundamentals/README.md) [23](../23-api-design/README.md)

**Event loop**: Node's single-threaded scheduler that runs your callbacks one at a time, between waiting for I/O. Blocking it with CPU work stalls every request. [01](../01-js-runtime/README.md)

**Event sourcing**: Storing every change as an immutable event and deriving current state by replaying them, instead of storing only the latest state. [33](../33-event-driven-architecture/README.md)

**Eventual consistency**: A guarantee that replicas or services will agree on the same data if no new updates happen, but may briefly disagree. [30](../30-system-design/README.md) [33](../33-event-driven-architecture/README.md)

**Exclusion constraint**: A Postgres constraint that forbids rows from overlapping on some operator, for example no two bookings for the same room with overlapping time ranges. [12](../12-data-modeling/README.md)

**Expand/contract migration**: Changing a schema without downtime in steps: add the new structure, migrate code and data, then remove the old structure once nothing uses it. [12](../12-data-modeling/README.md) [26](../26-docker-ci-deploy/README.md)

**EXPLAIN ANALYZE**: A Postgres command that runs a query and shows the plan it used with real timings and row counts. The primary tool for finding slow queries. [14](../14-query-performance/README.md)

---

## F

**Fail-open / fail-closed**: What a safety component does when it breaks: fail-open lets traffic through (a rate limiter whose Redis is down), fail-closed blocks it (an auth check). [19](../19-rate-limiting/README.md)

**Foreign key**: A constraint that a column's value must exist as a key in another table, with rules (`CASCADE`, `RESTRICT`, `SET NULL`) for what happens on delete. [12](../12-data-modeling/README.md)

---

## G

**Graceful shutdown**: On SIGTERM, stop accepting new work, finish in-flight requests or jobs, close pools and connections, then exit. Prevents dropped requests during deploys. [04](../04-checkpoint-foundations/README.md) [26](../26-docker-ci-deploy/README.md)

---

## H

**Health check**: An endpoint or command that reports whether a process is working. Used by Docker, load balancers and Kubernetes to route traffic and restart broken instances. [00](../00-dev-environment/README.md) [24](../24-observability/README.md) [34](../34-kubernetes-fundamentals/README.md)

**Helm**: A package manager for Kubernetes: charts are templated manifests plus a `values.yaml`, installed as versioned releases you can upgrade and roll back. [35](../35-kubernetes-in-practice/README.md)

**Hexagonal architecture**: An architecture where the business core defines interfaces (ports) and outside technology plugs in through adapters. Also called ports and adapters. [06](../06-layered-architecture/README.md)

**Horizontal vs vertical scaling**: Horizontal scaling adds more instances; vertical scaling gives one machine more CPU or memory. Horizontal has no hard ceiling but requires services to be stateless or to share state externally. [29](../29-reliability-scaling/README.md)

**HPA**: Horizontal Pod Autoscaler: a Kubernetes controller that adds or removes pod replicas based on CPU or custom metrics. [35](../35-kubernetes-in-practice/README.md)

**HttpOnly / Secure / SameSite**: Cookie flags: HttpOnly hides the cookie from JavaScript, Secure sends it only over HTTPS, and SameSite limits sending it on cross-site requests. [22](../22-auth/README.md)

**HyperLogLog**: A probabilistic Redis structure that estimates the number of unique items using a tiny, fixed amount of memory. [17](../17-redis-fundamentals/README.md)

---

## I

**Idempotency**: An operation is idempotent if doing it twice has the same effect as doing it once. It's what makes retries and redelivered messages safe. [03](../03-http-fundamentals/README.md) [15](../15-transactions-concurrency/README.md) [20](../20-background-jobs/README.md) [23](../23-api-design/README.md)

**Idempotency key**: A unique client-chosen key sent with a request (often a POST) so the server can recognize a retry and return the original result instead of acting twice. [15](../15-transactions-concurrency/README.md) [23](../23-api-design/README.md)

**IDOR**: Insecure Direct Object Reference: letting a user access another user's data just by changing an id in the URL because ownership isn't checked. [22](../22-auth/README.md) [25](../25-security/README.md)

**Image (Docker)**: A read-only, layered package of a filesystem and startup command from which containers are run. [00](../00-dev-environment/README.md) [26](../26-docker-ci-deploy/README.md)

**Inbox pattern**: A consumer records the ids of processed messages in its own database, in the same transaction as its work, so redeliveries are detected and skipped. [33](../33-event-driven-architecture/README.md)

**Ingress**: A Kubernetes object that routes external HTTP traffic to Services by host and path, implemented by an ingress controller. [35](../35-kubernetes-in-practice/README.md)

**Isolation level**: How much concurrent transactions can see of each other: Read Committed (Postgres default), Repeatable Read and Serializable trade performance for fewer anomalies. [15](../15-transactions-concurrency/README.md)

---

## J

**JWT**: JSON Web Token: a signed, base64url-encoded JSON payload used as a bearer token. It's verifiable without a database lookup, which also makes revoking it hard. [22](../22-auth/README.md)

---

## K

**KRaft**: Kafka's built-in consensus mode for cluster metadata, replacing ZooKeeper. This repo's local Kafka runs as a single KRaft node. [32](../32-kafka-fundamentals/README.md)

---

## L

**Latency percentiles (p50/p95/p99)**: The response time under which 50%, 95% or 99% of requests complete. Averages hide slow outliers; p99 shows what your unluckiest users feel. [24](../24-observability/README.md) [29](../29-reliability-scaling/README.md)

**Layered architecture**: Organizing code into layers with one job each (routes/controllers for HTTP, services for business rules, repositories for data), with dependencies pointing inward. [06](../06-layered-architecture/README.md)

**Little's law**: Average items in a system = arrival rate × average time in the system. Useful for sizing pools, queues and concurrency limits. [29](../29-reliability-scaling/README.md)

**Liveness probe**: A Kubernetes check that asks whether a container is alive. If it fails repeatedly, the container is restarted. [24](../24-observability/README.md) [34](../34-kubernetes-fundamentals/README.md)

**Load balancer**: A component that spreads incoming requests across several instances. L4 balancers route by connection; L7 balancers understand HTTP. [29](../29-reliability-scaling/README.md) [30](../30-system-design/README.md)

**Load shedding**: Deliberately rejecting some requests (often with 503) when overloaded, so the requests you do accept still succeed quickly. [29](../29-reliability-scaling/README.md)

**Lost update**: A concurrency anomaly where two transactions read the same value, both modify it, and the second write silently overwrites the first. [15](../15-transactions-concurrency/README.md)

**Lua script (Redis)**: A small script run inside Redis atomically, used when you need read-check-write logic that no single command provides, such as rate limiting or safe lock release. [17](../17-redis-fundamentals/README.md) [19](../19-rate-limiting/README.md)

---

## M

**Mass assignment**: Copying a request body straight into a model so a client can set fields it shouldn't, like `isAdmin`. Fixed by whitelisting fields with a schema. [25](../25-security/README.md)

**Microtask**: A callback queued by a resolved promise or `queueMicrotask`. All microtasks run before the event loop moves to the next timer or I/O callback. [01](../01-js-runtime/README.md)

**Middleware**: A function in Express's request chain that can act on the request, end the response, or pass control (or an error) to the next function. [05](../05-express-basics/README.md)

**Migration**: A versioned script that changes the database schema, applied in order and tracked so every environment ends up with the same structure. [12](../12-data-modeling/README.md) [13](../13-node-postgres/README.md)

**MVCC**: Multi-Version Concurrency Control: Postgres keeps old row versions so readers never block writers and each transaction sees a consistent snapshot. [15](../15-transactions-concurrency/README.md)

---

## N

**N+1 query**: Fetching a list with one query and then running one more query per item. Fast with 5 rows, painful with 500. Fixed with a JOIN or a batched `IN`/`ANY` query. [14](../14-query-performance/README.md)

**Namespace (Kubernetes)**: A way to group and isolate objects inside one cluster, for example per team or per environment. [34](../34-kubernetes-fundamentals/README.md)

**Negative caching**: Caching the fact that something doesn't exist, so repeated lookups for a missing item don't keep hitting the database. [18](../18-caching/README.md)

**Normalization**: Structuring tables so each fact is stored once (1NF to 3NF), which avoids update anomalies. Denormalization deliberately duplicates data for read speed. [12](../12-data-modeling/README.md)

---

## O

**OAuth 2.0 / OpenID Connect**: OAuth 2.0 lets an app get limited access to a user's account on another service; OpenID Connect adds a standard way to learn who the user is ("Log in with..."). [22](../22-auth/README.md)

**Observability**: How well you can understand a system's internal state from its outputs, mainly logs, metrics and traces. [24](../24-observability/README.md)

**Offset (Kafka)**: A record's sequential position within a partition. Consumer groups commit offsets to remember where to resume. [32](../32-kafka-fundamentals/README.md)

**Offset pagination**: Paging with `LIMIT n OFFSET m`. Simple, but the database still walks past all skipped rows, so deep pages get slow. [14](../14-query-performance/README.md) [23](../23-api-design/README.md)

**OOMKilled**: A container was killed because it used more memory than its limit. [35](../35-kubernetes-in-practice/README.md)

**OpenAPI**: A standard YAML/JSON format for describing an HTTP API's paths, parameters, request bodies and responses, used for docs, client generation and validation. [23](../23-api-design/README.md)

**OpenTelemetry**: A vendor-neutral standard and set of SDKs for producing traces, metrics and logs. [24](../24-observability/README.md)

**Optimistic concurrency**: Letting writers proceed without locks, then rejecting a write if the data changed since it was read (via a version column or ETag). Good when conflicts are rare. [15](../15-transactions-concurrency/README.md) [23](../23-api-design/README.md)

**Optimistic update (UI)**: Updating the UI immediately as if a request succeeded, then rolling back if the server returns an error. Makes apps feel instant. [R2](../R2-react-data/README.md)

**Outbox pattern**: Writing an event to an `outbox` table in the same transaction as the business change, then having a relay publish it to the broker. Solves the dual-write problem. [33](../33-event-driven-architecture/README.md)

**OWASP Top 10**: A regularly updated list of the most critical web application security risks, widely used as a security checklist. [25](../25-security/README.md)

---

## P

**Parameterized query**: Sending SQL and values separately (`WHERE id = $1`) so user input is never interpreted as SQL. The fix for SQL injection. [13](../13-node-postgres/README.md) [25](../25-security/README.md)

**Partial index**: An index built only over rows matching a `WHERE` condition, smaller and faster when you mostly query that subset. [14](../14-query-performance/README.md)

**Partition (Kafka)**: An ordered, append-only shard of a topic. Ordering is guaranteed only within a partition, and partitions are the unit of consumer parallelism. [32](../32-kafka-fundamentals/README.md)

**Partitioning / sharding**: Splitting data across tables or machines by a key so no single node holds everything. Sharding usually means across separate database servers. [30](../30-system-design/README.md)

**Pod**: The smallest deployable unit in Kubernetes: one or more containers that share a network address and storage. [34](../34-kubernetes-fundamentals/README.md)

**PodDisruptionBudget**: A Kubernetes rule that limits how many pods of an app can be voluntarily taken down at once, for example during node maintenance. [35](../35-kubernetes-in-practice/README.md)

**Poison message**: A message that always fails processing. Without a retry limit and DLQ it blocks its queue or partition forever. [20](../20-background-jobs/README.md) [33](../33-event-driven-architecture/README.md)

**Postmortem**: A blameless write-up after an incident covering the timeline, root cause, impact and follow-up actions. [24](../24-observability/README.md)

**Primary key**: The column(s) that uniquely identify each row. Surrogate keys (identity, UUID) are generated; natural keys come from the data itself. [12](../12-data-modeling/README.md)

**Prometheus**: A metrics system that scrapes numeric time series from a `/metrics` endpoint and lets you query and alert on them. Counters, gauges and histograms are its core types. [24](../24-observability/README.md)

**Prototype pollution**: A JavaScript attack where crafted input like `{"__proto__": {...}}` modifies `Object.prototype`, changing the behavior of every object in the process. [25](../25-security/README.md)

**Pub/Sub**: A messaging style where publishers send to a channel and every current subscriber receives a copy. Redis pub/sub doesn't store messages for absent subscribers. [17](../17-redis-fundamentals/README.md) [28](../28-realtime/README.md)

---

## Q

**Query planner**: The part of Postgres that chooses how to execute a query (which index, which join algorithm) based on table statistics. [14](../14-query-performance/README.md)

---

## R

**Race condition**: A bug where the outcome depends on the timing of concurrent operations, like two requests both reading "1 seat left" and both booking it. [01](../01-js-runtime/README.md) [15](../15-transactions-concurrency/README.md)

**Rate limiting**: Capping how many requests a client can make in a time window, to protect against abuse and keep usage fair. Exceeding it returns 429. [19](../19-rate-limiting/README.md)

**RBAC / ABAC**: Role-Based Access Control grants permissions by role (admin, member); Attribute-Based Access Control decides using attributes of the user, resource and context. [22](../22-auth/README.md)

**React Query (TanStack Query)**: A library that fetches, caches and refreshes server data in React, handling loading/error states, invalidation and retries for you. [R2](../R2-react-data/README.md)

**Readiness probe**: A Kubernetes check that decides whether a pod receives traffic. Failing readiness removes the pod from the Service without restarting it. [24](../24-observability/README.md) [34](../34-kubernetes-fundamentals/README.md)

**Rebalance (Kafka)**: Reassigning partitions among consumers in a group when members join, leave or time out. Processing pauses briefly while it happens. [32](../32-kafka-fundamentals/README.md)

**RED method**: Monitor every service by Rate (requests per second), Errors (failed requests) and Duration (latency distribution). [24](../24-observability/README.md)

**Redis**: An in-memory data structure server used for caching, counters, sessions, rate limiting, queues and pub/sub. [17](../17-redis-fundamentals/README.md)

**ReplicaSet**: A Kubernetes object that keeps a set number of identical pods running. You usually manage it indirectly through a Deployment. [34](../34-kubernetes-fundamentals/README.md)

**Replication**: Keeping copies of data on several nodes for durability and read scaling. Replicas may lag behind the primary. [30](../30-system-design/README.md) [32](../32-kafka-fundamentals/README.md)

**Repository pattern**: An interface that hides data access behind domain-friendly methods (`findById`, `save`), so business logic doesn't know whether data lives in memory or Postgres. [06](../06-layered-architecture/README.md) [13](../13-node-postgres/README.md)

**Request coalescing**: Letting concurrent identical requests share one in-flight operation instead of each doing the work, a key defense against cache stampedes. [01](../01-js-runtime/README.md) [18](../18-caching/README.md)

**Request id**: A unique id attached to each request and included in its logs and error responses, so one user action can be traced across log lines and services. [05](../05-express-basics/README.md) [24](../24-observability/README.md)

**Requests and limits**: Kubernetes resource settings: requests are what the scheduler reserves for a container, limits are the maximum it may use before being throttled (CPU) or killed (memory). [34](../34-kubernetes-fundamentals/README.md)

**Retention (Kafka)**: How long a topic keeps records, by time or size. Records stay available to any consumer until retention removes them, regardless of whether they were read. [32](../32-kafka-fundamentals/README.md)

**Reverse proxy**: A server that receives client requests and forwards them to backend servers, often also terminating TLS, compressing and caching. Nginx and Caddy are common. [29](../29-reliability-scaling/README.md) [37](../37-portfolio/README.md)

**Rolling update**: Replacing pods of a Deployment a few at a time so the app stays available during a release. [26](../26-docker-ci-deploy/README.md) [34](../34-kubernetes-fundamentals/README.md)

---

## S

**Saga**: A sequence of local transactions across services where each step has a compensating action to undo it if a later step fails. Can be orchestrated or choreographed. [33](../33-event-driven-architecture/README.md)

**Salt**: Random data mixed into each password before hashing so identical passwords produce different hashes and precomputed tables are useless. [22](../22-auth/README.md)

**Schema evolution**: Changing the shape of events or API payloads over time without breaking existing consumers, typically with versioning and backward-compatible changes. [23](../23-api-design/README.md) [33](../33-event-driven-architecture/README.md)

**Secret (Kubernetes)**: A Kubernetes object for sensitive values like passwords, injected into pods as env vars or files. Base64-encoded, not encrypted by default. [34](../34-kubernetes-fundamentals/README.md)

**Separation of concerns**: Splitting code so each part has one reason to change, such as HTTP handling, business rules and data access living in different modules. [06](../06-layered-architecture/README.md)

**Serializable isolation**: The strictest isolation level: transactions behave as if run one at a time. Postgres may abort conflicting transactions with error 40001, which you retry. [15](../15-transactions-concurrency/README.md)

**Server-Sent Events (SSE)**: A simple one-way stream from server to browser over a normal HTTP response, with automatic reconnection. Good for live feeds. [28](../28-realtime/README.md)

**Service (Kubernetes)**: A stable name and virtual IP that load-balances traffic across the pods matching its label selector. Types: ClusterIP (inside the cluster), NodePort (a port on every node) and LoadBalancer (an external cloud load balancer). [34](../34-kubernetes-fundamentals/README.md)

**Session**: Server-side state about a logged-in user, looked up by an id stored in a cookie. Easy to revoke, unlike stateless tokens. [22](../22-auth/README.md)

**SKIP LOCKED**: A Postgres row-locking option that skips rows other transactions have locked, letting several workers pull jobs from one table without blocking each other. [15](../15-transactions-concurrency/README.md) [33](../33-event-driven-architecture/README.md)

**SLI / SLO / SLA**: A Service Level Indicator is a measurement (success rate), an Objective is the target for it (99.9%), and an Agreement is a contract with consequences if the target is missed. [24](../24-observability/README.md) [29](../29-reliability-scaling/README.md)

**Sorted set (ZSET)**: A Redis structure of unique members each with a score, kept in order. Ideal for leaderboards, time-ordered windows and scheduling. [17](../17-redis-fundamentals/README.md) [19](../19-rate-limiting/README.md)

**SQL injection**: An attack where user input is concatenated into SQL and changes the query's meaning. Prevented with parameterized queries. [13](../13-node-postgres/README.md) [25](../25-security/README.md)

**SSRF**: Server-Side Request Forgery: tricking your server into making requests to internal addresses (like cloud metadata endpoints) by supplying a URL it fetches. [25](../25-security/README.md)

**STAR method**: A way to structure interview stories: Situation, Task, Action, Result. Keeps answers concrete and focused on what you did. [37](../37-portfolio/README.md)

**StatefulSet**: A Kubernetes workload for pods that need stable names and their own persistent storage, such as databases. [34](../34-kubernetes-fundamentals/README.md) [35](../35-kubernetes-in-practice/README.md)

**Stateless service**: A service that keeps no client state in its own memory between requests, so any instance can handle any request and you can scale by adding instances. [29](../29-reliability-scaling/README.md)

**Sticky sessions**: Routing a client to the same server instance every time, often needed for in-memory state or WebSocket connections. Hurts even load distribution. [28](../28-realtime/README.md) [29](../29-reliability-scaling/README.md)

**Structured logging**: Logging machine-parseable records (usually JSON lines with fields like level, requestId and duration) instead of free-form text, so logs can be searched and aggregated. [24](../24-observability/README.md)

---

## T

**Test doubles (fake, stub, spy, mock)**: Stand-ins for real dependencies in tests: a fake is a simplified working implementation (in-memory repository), a stub returns canned answers, a spy records calls, and a mock is pre-programmed with expected calls. [09](../09-testing/README.md)

**Timeout**: An upper bound on how long to wait for an operation. Without one, a hung dependency ties up resources indefinitely and failures cascade. [01](../01-js-runtime/README.md) [29](../29-reliability-scaling/README.md)

**TLS**: Transport Layer Security: encrypts and authenticates connections (the S in HTTPS) using certificates. [03](../03-http-fundamentals/README.md) [37](../37-portfolio/README.md)

**Token bucket**: A rate-limiting algorithm where tokens refill at a steady rate and each request spends one, allowing short bursts up to the bucket size. [19](../19-rate-limiting/README.md)

**Topic (Kafka)**: A named stream of records split into partitions that producers write to and consumers read from. [32](../32-kafka-fundamentals/README.md)

**Trace / span**: A trace follows one request across services; each span is one timed operation within it (an HTTP call, a query). Context is passed along in the `traceparent` header. [24](../24-observability/README.md)

**Transaction**: A group of database statements that succeed or fail together (`BEGIN` ... `COMMIT` / `ROLLBACK`). [13](../13-node-postgres/README.md) [15](../15-transactions-concurrency/README.md)

**TTL**: Time to live: how long a cache entry, key or record is kept before it expires automatically. [04](../04-checkpoint-foundations/README.md) [17](../17-redis-fundamentals/README.md) [18](../18-caching/README.md)

**Twelve-factor app**: A set of practices for cloud-friendly services, such as config in environment variables, stateless processes, and logs as event streams. [07](../07-validation-errors-config/README.md) [26](../26-docker-ci-deploy/README.md)

---

## U

**Unique constraint**: A database rule that no two rows share a value in a column or set of columns. Also an excellent concurrency guard, because the database enforces it atomically. [12](../12-data-modeling/README.md) [15](../15-transactions-concurrency/README.md)

**unknown (TypeScript)**: The type-safe counterpart of `any`: a value could be anything, and you must narrow or validate it before using it. [02](../02-typescript-fundamentals/README.md) [07](../07-validation-errors-config/README.md)

**Upsert**: Insert a row, or update it if it already exists, in one atomic statement (`INSERT ... ON CONFLICT DO UPDATE` in Postgres). [11](../11-sql-fundamentals/README.md)

**useEffect**: A React hook for synchronizing a component with something outside React (a subscription, a timer). Often overused for things that should be derived during render. [R1](../R1-react-fundamentals/README.md)

---

## V

**Validation (at the edge)**: Checking and parsing untrusted input where it enters the system (HTTP, env vars, messages) so inner layers can trust their types. [07](../07-validation-errors-config/README.md)

**Volume (Docker)**: Docker-managed storage that outlives containers, used to keep database data across restarts. [00](../00-dev-environment/README.md) [26](../26-docker-ci-deploy/README.md)

---

## W

**WAL (write-ahead log)**: Postgres's log of every change, written before data files are updated. It provides crash recovery and is the source for replication and CDC. [15](../15-transactions-concurrency/README.md) [33](../33-event-driven-architecture/README.md)

**Webhook**: An HTTP callback: your server POSTs an event to a URL a customer registered. Needs signing, retries and idempotent receivers. [23](../23-api-design/README.md)

**WebSocket**: A protocol that upgrades an HTTP connection into a long-lived, two-way channel for real-time messages. [28](../28-realtime/README.md)

**Window function**: A SQL function that computes over a set of rows related to the current row (`ROW_NUMBER`, `LAG`, running totals) without collapsing them like `GROUP BY` does. [11](../11-sql-fundamentals/README.md)

**Write skew**: An anomaly where two transactions read overlapping data, each make a decision that's valid alone, and together they break a rule. Serializable isolation prevents it. [15](../15-transactions-concurrency/README.md)

**Write-through / write-behind**: Caching strategies where writes go to the cache and the database together (write-through) or to the cache first with the database updated later (write-behind). [18](../18-caching/README.md)

---

## X

**XSS**: Cross-Site Scripting: injecting script into pages other users view. APIs help prevent it by returning correct content types and never reflecting unescaped input into HTML. [25](../25-security/README.md)

---

## Z

**Zero-downtime deploy**: Releasing a new version without dropping requests, using rolling or blue/green deployments, readiness checks, graceful shutdown and backward-compatible migrations. [26](../26-docker-ci-deploy/README.md) [34](../34-kubernetes-fundamentals/README.md)

**zod**: A TypeScript-first schema library that validates unknown data at runtime and infers static types from the same schema. [07](../07-validation-errors-config/README.md) [08](../08-typescript-for-backends/README.md)

---

[⬆ Back to top](#-glossary)
