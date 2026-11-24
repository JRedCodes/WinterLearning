<!--
SYSTEM DESIGN TEMPLATE (WinterLearning module 30)

Copy this file for every design you write, here and in later modules (31's DESIGN.md and the
capstone use it too). The order of the sections IS the framework from the lesson:
clarify → estimate → interface → data → boxes and arrows → go deep → own your trade-offs → plan for failure.

Everything inside HTML comments is guidance and doesn't count towards word minimums. Delete it
when you're done if you like. Aim for "a strong 45-minute interview, written down": concrete,
numeric, opinionated, and honest about what you gave up.
-->

# <System Name>

<!-- One or two sentences: what the system does and for whom. -->

## Requirements

<!--
### Functional
Bullets of what the system must DO, phrased as user-visible capabilities. Keep it to the 3–6 that
matter; say which ones are in scope for this design.

### Non-functional
The qualities: scale (users, DAU), latency targets (p99 for the hot path), availability target,
consistency needs (where is stale OK, where is it not?), durability, cost or compliance limits.
Numbers, not adjectives: "p99 < 200 ms", not "fast".

### Out of scope
What you're deliberately not designing, so the reader knows you thought about it.
-->

## Estimates

<!--
Back-of-envelope, rounded aggressively, arithmetic shown:
- Requests per second: average AND peak (peak ≈ 2–10x average, say which and why).
- Read:write ratio.
- Storage per item × items per day × retention = total. Replication factor?
- Bandwidth in/out at peak.
- Memory if you want to cache the hot set.
Finish with "So what?": which numbers drive the design (e.g. "writes fit on one Postgres primary;
reads need a cache", "fan-out writes 50k rows/s, so we need a queue").
-->

## API

<!--
The main endpoints (or WebSocket/queue messages) with request and response shapes, in a code block
or a table. Mention auth, pagination style, idempotency keys and error codes where they matter.
-->

## Data Model

<!--
Entities with their key fields and primary keys, the access patterns that drive them
("get the 20 newest posts for user X"), the indexes that serve those patterns, and which store
each lives in (Postgres, Redis, object storage, search index, ...) and WHY.
If you shard, name the shard key here.
-->

## High-Level Design

<!--
A ```mermaid flowchart of the components (clients, LB, services, caches, DBs, queues, workers),
then walk through the 2–3 most important flows step by step: "1. Client calls POST ... 2. ...".
Keep it to what's needed for the requirements above; deep detail goes in the next section.
-->

## Deep Dives

<!--
At least two ### subsections, each on one of the HARD parts of this problem (the thing an
interviewer would push on). For each: the problem, 2+ options, what you chose, and why.
Use numbers from your estimates to justify choices.
-->

## Trade-offs

<!--
At least three decisions as bullets or a table: what you chose, what you gave up, and when you'd
choose differently. Finish with what changes at 10x scale.
-->

## Failure Modes

<!--
At least four scenarios (a table works well: Failure | Impact | Mitigation | Detection).
Think: a node dies, a dependency is slow (not down!), the cache is flushed, a queue backs up,
a region goes away, a traffic spike, a bad deploy, a poison message, clock skew.
-->
