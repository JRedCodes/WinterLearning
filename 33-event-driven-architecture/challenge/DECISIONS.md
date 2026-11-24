# Decision: how outbox events get from Postgres to Kafka

<!--
The outbox table fixes the dual write. Something still has to move rows from the outbox to Kafka,
and the platform team asks whether we should keep the polling OutboxRelay or switch to CDC (Debezium).
Write a short decision record. A few sentences or bullets per section is plenty.
The tests check that every section has real content (at least 25 words, no TODO), and that
"Options considered" discusses both polling and CDC.
Delete these comments when you're done.
-->

## Context

<!-- What problem does the outbox solve, and what does the relay have to guarantee (ordering, at-least-once, latency)?
What's our scale and team size? -->
TODO

## Options considered

<!-- At least: (1) polling publisher (our OutboxRelay with FOR UPDATE SKIP LOCKED), (2) CDC: Debezium reading the
Postgres WAL via logical replication. Pros and cons: latency, load on the DB, operational cost, ordering, failure modes. -->
TODO

## Decision

<!-- What you pick for now, and when you'd revisit it. -->
TODO

## Consequences

<!-- What do we need to operate or monitor now? (outbox table growth / cleanup, relay lag, duplicates downstream, ...) -->
TODO
