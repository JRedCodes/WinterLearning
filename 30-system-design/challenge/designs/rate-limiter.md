<!--
THE PROMPT
"Design a distributed rate limiter used by an API gateway in front of all our public APIs. Limits are
per API key and per endpoint group, configurable without a deploy (e.g. 1,000 req/min for the free
tier, 20,000 req/min for enterprise). Traffic is 500k requests/s at peak across 40 gateway instances
in 2 regions. The limiter must add very little latency."

The tests check headings, word minimums, a mermaid diagram, numbers in Estimates, and that you
discuss the algorithm, atomicity, fail-open vs fail-closed and the 429 contract.
(Module 19 built the code; this is the system around it.)
-->

# Rate Limiter (distributed)

## Requirements

<!-- Functional: limit by key + rule, configurable rules, response headers, bypass list?
Non-functional: added latency budget (p99), accuracy (is 2% over the limit OK?), availability
(what if the limiter's store is down?), multi-region. -->

## Estimates

<!-- Checks/s, number of active keys, memory per key for your algorithm, total memory,
network round trips per request. -->

## API

<!-- The internal interface the gateway calls (or the library API), the rule config format,
and the HTTP contract clients see (429, Retry-After, RateLimit headers). -->

## Data Model

<!-- Counter/bucket state per key (and its TTL), rules storage, how rules reach the gateways. -->

## High-Level Design

<!-- Gateway instances, a shared store (Redis cluster?), rules service/config, local caches. -->

## Deep Dives

<!-- Suggested: algorithm choice with memory/accuracy numbers; atomic check-and-update (Lua,
single round trip); hot keys and sharding the counter store; local pre-aggregation to save round
trips; multi-region limits (global vs per-region budgets). -->

## Trade-offs

<!-- Accuracy vs latency, central store vs local counters, fail open vs fail closed. -->

## Failure Modes

<!-- Redis shard down, network partition between regions, one key generating a huge share of
traffic, clock differences between gateways, a bad rule pushed. -->
