# DESIGN · Event Ticketing Platform

<!--
M8. Write this for a senior engineer who has never seen your code. It's the
document you'll walk through in interviews, so describe what YOU built and why.
Use module 30's template and worked example as a guide.

The tests check: every section exists, has 60+ words, contains no TODO, and
"High-Level Design" contains a ```mermaid diagram.
-->

## Requirements

TODO: Functional requirements (what users can do) and non-functional ones (consistency
of seat sales, latency, availability, on-sale traffic spikes). State what is out of scope.

## Estimates

TODO: Back-of-envelope numbers: users, events, seats per event, peak holds/second
during a popular on-sale, read:write ratio, storage per year, SSE connections.

## API

TODO: The main endpoints and why they look the way they do (holds as a resource,
Idempotency-Key on POST /bookings, error codes, SSE stream).

## Data Model

TODO: Tables, keys and constraints (an erDiagram is welcome). Which invariants does the
database enforce, and which does the application enforce?

## High-Level Design

TODO: Components and how a booking flows through them. Include a ```mermaid diagram.

## Deep Dives

TODO: Pick 2-3: preventing double booking, hold expiry, idempotency, the outbox,
realtime fan-out across instances, caching strategy.

## Trade-offs

TODO: What you chose, what you gave up, what you'd do with 10x traffic.

## Failure Modes

TODO: What happens when Postgres, Redis, Kafka, the email provider, or an API pod
fails mid-request? What does the user see, and how does the system recover?
