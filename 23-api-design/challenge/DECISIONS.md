# DECISIONS · API versioning & evolution

<!--
A short architecture decision record (ADR). Replace every TODO line.
Each section needs at least ~30 words of real content (the tests check this).
The team already ships URLs under /v1. Your job is to record WHY, compare the
alternatives honestly, and define the rules for evolving the API: what counts
as a breaking change, and how a version is deprecated and retired.
-->

## Context

TODO: Who consumes this API (our web app? mobile apps that update slowly? partners?), and why
does versioning matter for them?

## Options considered

TODO: At least three: URL path (/v1), a header or media type (Accept: application/vnd...+json;
version=2), date-based versions (Stripe-style). Pros and cons of each.

## Decision

TODO: What we do, plus the rules: which changes are additive (no new version) and which are
breaking (new major version).

## Consequences

TODO: Deprecation process (Deprecation / Sunset headers, how long old versions live, how we
find out who still calls them), costs of running two versions, what would make us revisit this.
