# Decisions

Record the trade-offs you made while hardening the notes API. Write at least the two
decisions below (add more if you like). Replace every HTML comment with your own words.
The tests check that each heading exists and has real content (not just the comments).

## Decision 1: How users stay logged in

### Context
<!-- What problem are you solving? Constraints: browser clients, logout must work immediately, ... -->

### Options considered
<!-- e.g. server-side sessions in Redis vs JWT access + refresh tokens vs ... Pros and cons of each. -->

### Decision
<!-- What did you pick, and the main reason. Cookie flags you chose and why. -->

### Consequences
<!-- What does this cost you? What gets easier or harder (scaling, revocation, CSRF, mobile clients...)? -->

## Decision 2: How login attempts are rate limited

### Context
<!-- What attack are you defending against? What must keep working for legitimate users? -->

### Options considered
<!-- Key by IP? by email? both? Algorithm (fixed window, sliding window, token bucket)? Fail open or closed when Redis is down? -->

### Decision
<!-- What did you pick and why. -->

### Consequences
<!-- Known weaknesses (shared IPs, distributed attacks, account lockout abuse...) and what you'd do next. -->
