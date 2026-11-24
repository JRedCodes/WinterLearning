# Decision: partitioning the order-events topic

<!--
Before this topic goes to production your lead asks: "How many partitions, and what's the key?"
Write a short decision record. A few sentences or bullets per section is plenty.
The tests check that every section has real content (at least 25 words, no TODO),
and that the Decision names a partition count (a number) and the key field (orderId or customerId).
Delete these comments when you're done.
-->

## Context

<!-- Who produces and who consumes this topic? What must stay in order? What throughput do you expect,
and how many consumer instances might the projection need? -->
TODO

## Options considered

<!-- At least two options for the key (orderId vs customerId vs no key) and a word on partition count
(e.g. 3 vs 12 vs 50). Pros and cons of each: ordering, parallelism, hot partitions, changing it later. -->
TODO

## Decision

<!-- What key, how many partitions, and the main reason. -->
TODO

## Consequences

<!-- What gets easier or harder? Think: the per-customer projection now receives one customer's events
from several partitions; what happens if you add partitions later; hot keys. -->
TODO
