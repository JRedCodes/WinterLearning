# DECISIONS · Architecture decision records

<!--
One ADR per significant choice. Keep the "## ADR-NNN: title" and "###" headings;
replace every TODO. Each "###" section needs 20+ words (the tests check). Add more
ADRs as you go: a capstone usually ends up with five to ten.

Suggested first three (rename them to what you actually decided):
-->

## ADR-001: How seat holds prevent double booking

### Context

TODO

### Options considered

TODO: e.g. SELECT ... FOR UPDATE on seat rows, a conditional UPDATE, SERIALIZABLE
isolation with retries, Redis locks (SET NX), an exclusion/unique constraint.

### Decision

TODO

### Consequences

TODO

## ADR-002: Session tokens vs JWTs

### Context

TODO

### Options considered

TODO

### Decision

TODO

### Consequences

TODO

## ADR-003: Server-Sent Events vs WebSockets for the live seat map

### Context

TODO

### Options considered

TODO

### Decision

TODO

### Consequences

TODO
